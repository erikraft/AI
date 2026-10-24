import gc
import hmac
import json
import os
import shutil
import tempfile
import wave

import gradio as gr
from gradio_client import Client, handle_file
import spaces
import torch

# Qwen3VLVideoProcessor (used by Qwythos' multimodal AutoProcessor) requires torchvision.
# Do not prevent the other model tabs from booting if this optional import is broken;
# leave a precise diagnostic in the Space logs so Qwythos failure is actionable.
try:
    import torchvision
except Exception as exc:
    print(f"[runtime-diagnostics] torchvision import failed: {type(exc).__name__}: {exc}")
else:
    print(
        f"[runtime-diagnostics] torch={torch.__version__}; "
        f"torchvision={torchvision.__version__}; "
        f"cuda_available={torch.cuda.is_available()}"
    )

from diffusers import DiffusionPipeline, FluxImg2ImgPipeline
from PIL import Image
from transformers import AutoModelForImageTextToText, AutoProcessor

FLUX_MODEL_ID = "aoxo/flux.1dev-abliterated"
QWYTHOS_MODEL_ID = "fluffy12222/Qwythos-9B-Claude-Mythos-5-1M-heretic-abliterated"
COSMOS_MODEL_ID = "DuoNeural/Cosmos3-Nano-Abliterated"
QWEN_MODEL_ID = "0bserverx/Qwen3.8-27B-Heretic-Abliterated-Uncensored-GGUF"
ENABLE_COSMOS_VIDEO = os.getenv("ENABLE_COSMOS_VIDEO", "true").strip().lower() in {"1", "true", "yes"}
ENABLE_QWEN_TEXT = os.getenv("ENABLE_QWEN_TEXT", "true").strip().lower() in {"1", "true", "yes"}
QWEN_GGUF_FILE = "RVN-IQ2_XS.gguf"
# The deployed ZeroGPU request surfaced 300 seconds as a 450-second reservation.
# Keep Qwythos below the observed 300-second ceiling, with headroom for scheduler overhead.
MAX_QWYTHOS_GPU_SECONDS = 180

pipe = None
pipe_mode = None
qwythos_vision_model = None
qwythos_processor = None
cosmos_pipe = None
qwen_text_model = None


def _authorize_experimental_api(candidate: str):
    """Fail closed unless the caller supplies the server-side shared secret."""
    expected = os.getenv("HF_SPACE_API_SECRET", "").strip()
    if len(expected) < 32:
        raise gr.Error("Experimental API is locked: configure a strong HF_SPACE_API_SECRET on this Space and the server-side caller.")
    if not isinstance(candidate, str) or not hmac.compare_digest(candidate, expected):
        raise gr.Error("Unauthorized experimental model endpoint.")


def _clear_models(except_model: str):
    """Unload every model except the selected one to limit shared RAM/VRAM pressure."""
    global pipe, pipe_mode, qwythos_vision_model, qwythos_processor, cosmos_pipe, qwen_text_model
    if except_model not in {"flux", "flux-img2img"} and pipe is not None:
        del pipe
        pipe = None
        pipe_mode = None
    if except_model != "qwythos":
        if qwythos_vision_model is not None:
            del qwythos_vision_model
            qwythos_vision_model = None
        if qwythos_processor is not None:
            del qwythos_processor
            qwythos_processor = None
    if except_model != "cosmos" and cosmos_pipe is not None:
        del cosmos_pipe
        cosmos_pipe = None
    if except_model != "qwen" and qwen_text_model is not None:
        del qwen_text_model
        qwen_text_model = None
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def _disk_free_gib(path: str = "/") -> float:
    return shutil.disk_usage(path).free / (1024 ** 3)


def _available_ram_gib() -> float:
    try:
        return os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_AVPHYS_PAGES") / (1024 ** 3)
    except (ValueError, OSError, AttributeError):
        return 0.0


def _cached_repo_size_gib(repo_cache_name: str) -> float:
    """Estimate cached weight size without double-counting symlinks to the same blobs."""
    cache_root = os.path.expanduser(
        os.path.join("~", ".cache", "huggingface", "hub", repo_cache_name, "snapshots")
    )
    total_bytes = 0
    seen = set()
    if not os.path.isdir(cache_root):
        return 0.0
    for root, _, filenames in os.walk(cache_root):
        for filename in filenames:
            if filename.endswith((".safetensors", ".gguf", ".bin")):
                path = os.path.join(root, filename)
                try:
                    target = os.path.realpath(path)
                    if target not in seen:
                        seen.add(target)
                        total_bytes += os.path.getsize(path)
                except OSError:
                    continue
    return total_bytes / (1024 ** 3)


def _has_cached_repo(repo_cache_name: str, minimum_bytes: int = 1_000_000_000) -> bool:
    return _cached_repo_size_gib(repo_cache_name) * (1024 ** 3) >= minimum_bytes


def _load_flux(image_to_image: bool = False):
    """Load one FLUX pipeline variant at a time to avoid duplicate weights in RAM."""
    global pipe, pipe_mode
    requested_mode = "img2img" if image_to_image else "text2img"
    if pipe is not None and pipe_mode != requested_mode:
        del pipe
        pipe = None
        pipe_mode = None
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    _clear_models("flux-img2img" if image_to_image else "flux")
    if pipe is None:
        pipeline_class = FluxImg2ImgPipeline if image_to_image else DiffusionPipeline
        pipe = pipeline_class.from_pretrained(
            FLUX_MODEL_ID,
            torch_dtype=torch.bfloat16,
        )
        pipe_mode = requested_mode
    return pipe


@spaces.GPU(duration=120)
def generate_image(prompt: str, width: int = 768, height: int = 768, steps: int = 20):
    prompt = (prompt or "").strip()
    if not prompt or len(prompt) > 1500:
        raise gr.Error("Prompt must contain 1–1500 characters.")
    if (int(width), int(height)) not in {(768, 768), (1024, 768), (768, 1024)}:
        raise gr.Error("Unsupported image dimensions.")
    if int(steps) not in {20, 28}:
        raise gr.Error("Unsupported inference step count.")

    image_pipe = _load_flux()
    try:
        image_pipe.to("cuda")
        result = image_pipe(
            prompt,
            width=int(width),
            height=int(height),
            num_inference_steps=int(steps),
        )
        return result.images[0]
    except torch.cuda.OutOfMemoryError as exc:
        raise gr.Error(
            "FLUX ran out of GPU memory. Try a smaller image or a Space with more capable hardware."
        ) from exc
    finally:
        try:
            image_pipe.to("cpu")
        except Exception:
            pass
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()


@spaces.GPU(duration=MAX_QWYTHOS_GPU_SECONDS)
def generate_image_from_image(
    prompt: str,
    reference_image: Image.Image,
    language: str = "pt-BR",
):
    """Interpret image + instructions and return a prompt for a separate FLUX GPU request."""
    global qwythos_vision_model, qwythos_processor

    prompt = (prompt or "").strip()
    if not prompt or len(prompt) > 1500:
        raise gr.Error("Instructions must contain 1–1500 characters.")
    if reference_image is None:
        raise gr.Error("Upload a reference image.")
    language_value = str(language or "auto").strip()
    language = "auto" if language_value.lower() in {"auto", "detect"} else (
        "en" if language_value.lower().startswith("en") else
        "pt-BR" if language_value.lower().startswith("pt") else language_value
    )

    # Release FLUX before loading Qwythos so the two large models are not resident together.
    _clear_models("qwythos")
    if qwythos_vision_model is None or qwythos_processor is None:
        try:
            qwythos_processor = AutoProcessor.from_pretrained(QWYTHOS_MODEL_ID)
            qwythos_vision_model = AutoModelForImageTextToText.from_pretrained(
                QWYTHOS_MODEL_ID,
                torch_dtype=torch.bfloat16,
                low_cpu_mem_usage=True,
            )
        except Exception as exc:
            qwythos_processor = None
            qwythos_vision_model = None
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            raise gr.Error(
                "Qwythos multimodal loading failed; check model compatibility and Space logs: "
                + str(exc)[:300]
            ) from exc

    inputs = None
    try:
        qwythos_vision_model.to("cuda")
        image = reference_image.convert("RGB")
        image.thumbnail((1280, 1280))
        language_name = (
            "the same language as the user's instructions (detect the language automatically)"
            if language == "auto"
            else "English" if language == "en"
            else "Brazilian Portuguese" if language == "pt-BR"
            else language
        )
        messages = [{
            "role": "user",
            "content": [
                {"type": "image", "image": image},
                {
                    "type": "text",
                    "text": (
                        "Use the reference image and user instructions to write a concise image-edit prompt. "
                        "The uploaded image is the source image to EDIT, not merely visual inspiration. Preserve the "
                        "same people and recognizable identities: facial structure, eyes, nose, mouth, skin tone, age, "
                        "hairstyle, body proportions, clothing, pose, and positions. Do not replace, beautify, redesign, "
                        "or invent faces. Change only what the user explicitly requests; preserve all other visible "
                        "details, framing, and background. Return only the final prompt in " + language_name + ". "
                        "Do not claim an image has already been generated.\n\n"
                        "User instructions: " + prompt
                    ),
                },
            ],
        }]
        chat_text = qwythos_processor.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
        )
        inputs = qwythos_processor(
            text=[chat_text],
            images=[image],
            return_tensors="pt",
        ).to("cuda")
        with torch.inference_mode():
            output = qwythos_vision_model.generate(
                **inputs,
                max_new_tokens=220,
                do_sample=False,
            )
        generated_prompt = qwythos_processor.batch_decode(
            output[:, inputs["input_ids"].shape[-1]:],
            skip_special_tokens=True,
        )[0].strip()
        if not generated_prompt:
            raise gr.Error("Qwythos did not return a usable image prompt.")
        identity_preservation = (
            "Preserve the same recognizable people and facial identities from the reference image; "
            "do not change faces, skin tone, age, hairstyle, body proportions, clothing, pose, or positions. "
            "Apply only the requested edits and keep all other details unchanged."
        )
        # Reserve space for the preservation constraints so truncation cannot remove them.
        generated_prompt = generated_prompt[:700].rstrip(" .") + ". " + identity_preservation
        return generated_prompt[:1500]
    except gr.Error:
        raise
    except torch.cuda.OutOfMemoryError as exc:
        raise gr.Error(
            "Qwythos ran out of GPU memory while interpreting the reference image. "
            "Try a smaller reference image or use hardware with more memory."
        ) from exc
    except Exception as exc:
        raise gr.Error(
            "Qwythos could not process this image + instructions; check Space logs: "
            + str(exc)[:300]
        ) from exc
    finally:
        if inputs is not None:
            del inputs
        if qwythos_vision_model is not None:
            try:
                qwythos_vision_model.to("cpu")
            except Exception:
                pass
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()


@spaces.GPU(duration=120)
def generate_image_from_reference(
    prompt: str,
    reference_image: Image.Image,
    width: int = 768,
    height: int = 768,
    steps: int = 20,
):
    """Edit the actual source image instead of regenerating from text alone."""
    if not isinstance(reference_image, Image.Image):
        raise gr.Error("Upload a valid reference image.")
    prompt = (prompt or "").strip()
    if not prompt or len(prompt) > 1500:
        raise gr.Error("Prompt must contain 1–1500 characters.")
    if (int(width), int(height)) not in {(768, 768), (1024, 768), (768, 1024)}:
        raise gr.Error("Unsupported image dimensions.")
    if int(steps) not in {20, 28}:
        raise gr.Error("Unsupported inference step count.")
    image_pipe = _load_flux(image_to_image=True)
    try:
        image_pipe.to("cuda")
        # Preserve the whole source image and aspect ratio; do not crop people to force a canvas ratio.
        source = reference_image.convert("RGB")
        source.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
        safe_width = max(16, (source.width // 16) * 16)
        safe_height = max(16, (source.height // 16) * 16)
        if source.size != (safe_width, safe_height):
            source = source.resize((safe_width, safe_height), Image.Resampling.LANCZOS)
        result = image_pipe(
            prompt=prompt,
            image=source,
            width=safe_width,
            height=safe_height,
            strength=0.30,
            num_inference_steps=int(steps),
            guidance_scale=3.5,
        )
        return result.images[0]
    except torch.cuda.OutOfMemoryError as exc:
        raise gr.Error("FLUX image editing ran out of GPU memory. Try a smaller reference image or use hardware with more memory.") from exc
    except gr.Error:
        raise
    except Exception as exc:
        raise gr.Error("FLUX could not edit the reference image. Check Diffusers compatibility and Space logs: " + str(exc)[:240]) from exc
    finally:
        try:
            image_pipe.to("cpu")
        except Exception:
            pass
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()


def _authorize_video_request_duration(prompt: str, api_secret: str, *args, **kwargs) -> int:
    """Reject unauthorized/invalid calls before ZeroGPU schedules a GPU worker.

    ZeroGPU evaluates the callable duration before reserving capacity. Keeping the
    authorization check here avoids charging an unauthorized API caller for a GPU
    reservation while the actual Gradio handler remains @spaces.GPU-decorated.
    """
    _authorize_experimental_api(api_secret)
    if not ENABLE_COSMOS_VIDEO:
        raise gr.Error("Cosmos video is disabled. Enable ENABLE_COSMOS_VIDEO only after validating GPU and disk capacity.")
    if not isinstance(prompt, str) or not prompt.strip() or len(prompt.strip()) > 1500:
        raise gr.Error("Prompt must contain 1–1500 characters.")
    return 180


@spaces.GPU(duration=_authorize_video_request_duration)
def generate_video(prompt: str, api_secret: str):
    """Short, low-resolution Cosmos video; disabled unless hardware is explicitly approved."""
    global cosmos_pipe
    prompt = (prompt or "").strip()
    _authorize_experimental_api(api_secret)
    if not ENABLE_COSMOS_VIDEO:
        raise gr.Error("Cosmos video is disabled. Enable ENABLE_COSMOS_VIDEO only after validating GPU and disk capacity.")
    if not prompt or len(prompt) > 1500:
        raise gr.Error("Prompt must contain 1–1500 characters.")
    if not torch.cuda.is_available():
        raise gr.Error("Cosmos requires a compatible CUDA GPU.")
    cached_size_gib = _cached_repo_size_gib("models--DuoNeural--Cosmos3-Nano-Abliterated")
    free_disk_gib = _disk_free_gib()
    if cached_size_gib < 28 and free_disk_gib < 30:
        raise gr.Error(
            f"Cosmos needs tens of gigabytes of model cache; only {free_disk_gib:.1f} GiB free disk space is available and the detected model cache is {cached_size_gib:.1f} GiB."
        )
    # Free memory occupied by other models before measuring VRAM available to Cosmos.
    _clear_models("cosmos")
    total_gib = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
    free_gib = torch.cuda.mem_get_info()[0] / (1024 ** 3)
    # ZeroGPU advertises a 48 GB card, which is about 44.7 GiB when
    # torch reports bytes using 1024**3. A 48 GiB threshold would reject
    # every nominal 48 GB ZeroGPU device before loading the model.
    if total_gib < 42 or free_gib < 36:
        raise gr.Error(
            f"Cosmos needs a 48 GB-class GPU with substantial free VRAM. This runtime reports {total_gib:.1f} GiB total and {free_gib:.1f} GiB free; refusing to load to reduce OOM risk."
        )
    path = None
    keep_path_for_gradio = False
    try:
        from diffusers import Cosmos3OmniPipeline
        from diffusers.utils import export_to_video
        if cosmos_pipe is None:
            cosmos_pipe = Cosmos3OmniPipeline.from_pretrained(COSMOS_MODEL_ID, dtype=torch.bfloat16)
        cosmos_pipe.to("cuda")
        result = cosmos_pipe(
            prompt=prompt,
            num_frames=16,
            height=256,
            width=256,
            num_inference_steps=12,
            guidance_scale=6.0,
            fps=8.0,
        )
        cache_dir = getattr(demo, "GRADIO_CACHE", tempfile.gettempdir())
        os.makedirs(cache_dir, exist_ok=True)
        path = tempfile.NamedTemporaryFile(prefix="erikraft-cosmos-", suffix=".mp4", dir=cache_dir, delete=False).name
        export_to_video(result.video, path, fps=8, macro_block_size=1)
        keep_path_for_gradio = True
        return path
    except gr.Error:
        raise
    except torch.cuda.OutOfMemoryError as exc:
        raise gr.Error("Cosmos exceeded available GPU memory. Use a larger GPU or keep video generation disabled.") from exc
    except Exception as exc:
        raise gr.Error("Cosmos video generation failed: " + str(exc)[:280]) from exc
    finally:
        # Remove partial files on failure; successful outputs are in Gradio's managed cache.
        if path and not keep_path_for_gradio:
            try:
                os.remove(path)
            except OSError:
                pass
        # Do not move the entire video model to CPU RAM during teardown; release it instead.
        cosmos_pipe = None
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()


def generate_text(
    prompt: str,
    language: str = "pt-BR",
    api_secret: str = "",
    tools_json: str = "[]",
    messages_json: str = "",
):
    """CPU-only GGUF inference with optional, backend-orchestrated tool calling."""
    global qwen_text_model
    prompt = (prompt or "").strip()
    if not ENABLE_QWEN_TEXT:
        raise gr.Error("Qwen text generation is disabled. Enable ENABLE_QWEN_TEXT only after validating system RAM and disk.")
    _authorize_experimental_api(api_secret)
    if not prompt or len(prompt) > 1500:
        raise gr.Error("Prompt must contain 1–1500 characters.")
    if not _has_cached_repo("models--0bserverx--Qwen3.8-27B-Heretic-Abliterated-Uncensored-GGUF") and _disk_free_gib() < 11:
        raise gr.Error(f"Qwen needs about 9.1 GB for its selected GGUF plus cache overhead; only {_disk_free_gib():.1f} GiB free disk space is available.")
    _clear_models("qwen")
    available_ram = _available_ram_gib()
    if qwen_text_model is None and available_ram < 12:
        raise gr.Error(f"Qwen CPU inference needs roughly 12 GiB free RAM; only {available_ram:.1f} GiB appears available.")
    try:
        if qwen_text_model is None:
            print(f"[qwen-diagnostics] loading GGUF model; available_ram_gib={available_ram:.2f}; free_disk_gib={_disk_free_gib():.2f}", flush=True)
            from llama_cpp import Llama
            qwen_text_model = Llama.from_pretrained(
                repo_id=QWEN_MODEL_ID,
                filename=QWEN_GGUF_FILE,
                n_ctx=4096,
                n_batch=64,
                n_threads=max(2, min(4, os.cpu_count() or 2)),
                n_gpu_layers=0,
                verbose=False,
            )
            print("[qwen-diagnostics] model loaded; starting CPU inference", flush=True)
        language_value = str(language or "auto").strip()
        language_name = (
            "the same language as the user's prompt (detect it automatically)"
            if language_value.lower() in {"auto", "detect"}
            else "Brazilian Portuguese" if language_value.lower().startswith("pt")
            else "English" if language_value.lower().startswith("en")
            else language_value
        )
        try:
            supplied_messages = json.loads(messages_json) if messages_json else None
            if not isinstance(supplied_messages, list) or not supplied_messages:
                supplied_messages = [
                    {"role": "system", "content": "Answer helpfully in " + language_name + ". You are a third-party model running inside ErikrafT AI; do not claim ErikrafT created you."},
                    {"role": "user", "content": prompt},
                ]
            if len(supplied_messages) > 16:
                raise ValueError("Too many chat messages.")
            messages = supplied_messages
            supplied_tools = json.loads(tools_json or "[]")
            if not isinstance(supplied_tools, list) or len(supplied_tools) > 50:
                raise ValueError("Invalid MCP tool list.")
        except (ValueError, TypeError, json.JSONDecodeError) as exc:
            raise gr.Error("Invalid chatbot tool or conversation payload.") from exc
        request = {
            "messages": messages,
            "max_tokens": 384,
            "temperature": 0.7,
        }
        if supplied_tools:
            request["tools"] = supplied_tools
            request["tool_choice"] = "auto"
        result = qwen_text_model.create_chat_completion(**request)
        print("[qwen-diagnostics] CPU inference completed", flush=True)
        message = result["choices"][0]["message"]
        tool_calls = message.get("tool_calls") or []
        if tool_calls:
            # Tool calls are only proposals. The Vercel backend validates the names,
            # executes approved calls through the user's configured MCP servers, and
            # sends the results back to Qwen for a final answer.
            return json.dumps({
                "mcp_tool_calls": tool_calls[:8],
                "assistant_content": str(message.get("content") or "")[:4000],
            }, ensure_ascii=False)
        answer = str(message.get("content") or "").strip()
        if not answer:
            raise gr.Error("Qwen returned an empty response.")
        return answer[:12000]
    except gr.Error:
        raise
    except MemoryError as exc:
        qwen_text_model = None
        gc.collect()
        raise gr.Error("Qwen exceeded available system RAM. Reduce load or keep this mode disabled.") from exc
    except Exception as exc:
        qwen_text_model = None
        gc.collect()
        raise gr.Error("Qwen text generation failed: " + str(exc)[:280]) from exc


def _validated_reference_audio_path(reference_audio: str) -> str:
    """Canonicalize an uploaded path and confine it to Gradio's trusted upload cache."""
    error_message = (
        "Upload or record a reference audio sample managed by this Space. "
        "/ Envie ou grave uma amostra de áudio gerenciada por este Space."
    )
    if not isinstance(reference_audio, str) or not reference_audio.strip():
        raise gr.Error(error_message)

    cache_dir = getattr(demo, "GRADIO_CACHE", None)
    if not isinstance(cache_dir, (str, os.PathLike)) or not cache_dir:
        raise gr.Error(error_message)

    try:
        # realpath resolves traversal segments and symlinks before any file access.
        cache_root = os.path.realpath(os.fspath(cache_dir))
        audio_path = os.path.realpath(reference_audio)
        cache_prefix = os.path.join(cache_root, "")
        common_root = os.path.commonpath((cache_root, audio_path))
    except (OSError, TypeError, ValueError):
        raise gr.Error(error_message) from None

    # Require a child of the cache root (not a similarly prefixed sibling).
    # Keep both commonpath and the separator-terminated prefix check explicit.
    if common_root != cache_root or not audio_path.startswith(cache_prefix):
        raise gr.Error(error_message)
    if not os.path.isfile(audio_path):
        raise gr.Error(error_message)

    audio_size = os.path.getsize(audio_path)
    if audio_size <= 0:
        raise gr.Error(error_message)
    if audio_size > 3 * 1024 * 1024:
        raise gr.Error(
            "Reference audio must be at most 3 MiB. / "
            "O áudio de referência deve ter no máximo 3 MiB."
        )
    return audio_path


def _validate_reference_audio_duration(audio_path: str) -> None:
    """Reject audio shorter than 10 seconds; Gradio Audio has no min_length argument."""
    try:
        with wave.open(audio_path, "rb") as audio_file:
            duration_seconds = audio_file.getnframes() / float(audio_file.getframerate())
    except (OSError, EOFError, wave.Error, ZeroDivisionError) as exc:
        raise gr.Error(
            "Could not read the reference audio duration. Upload a valid audio sample. / "
            "Não foi possível ler a duração do áudio. Envie uma amostra válida."
        ) from exc
    if duration_seconds < 10:
        raise gr.Error(
            "Reference audio must be at least 10 seconds long. / "
            "O áudio de referência deve ter pelo menos 10 segundos."
        )


VOICE_LANGUAGE_CODES = {
    "en": "en", "pt": "pt", "es": "es", "fr": "fr", "de": "de",
    "it": "it", "pl": "pl", "tr": "tr", "ru": "ru", "nl": "nl",
    "cs": "cs", "ar": "ar", "zh": "zh-cn", "ja": "ja", "ko": "ko",
    "hu": "hu",
}


def _whisper_transcription_endpoint(whisper: Client) -> str | int:
    """Discover the current Whisper audio+task endpoint instead of assuming its name."""
    api = whisper.view_api(return_format="dict", print_info=False)
    for endpoint_name, endpoint in api.get("named_endpoints", {}).items():
        parameters = endpoint.get("parameters", [])
        components = {str(parameter.get("component", "")).lower() for parameter in parameters}
        if len(parameters) >= 2 and "audio" in components and "radio" in components:
            return endpoint_name
    for endpoint_index, endpoint in api.get("unnamed_endpoints", {}).items():
        parameters = endpoint.get("parameters", [])
        components = {str(parameter.get("component", "")).lower() for parameter in parameters}
        if len(parameters) >= 2 and "audio" in components and "radio" in components:
            return int(endpoint_index)
    raise RuntimeError("Whisper Space exposes no discoverable audio transcription endpoint.")


def _detect_reference_language(reference_audio: str) -> str:
    """Detect spoken language from the reference audio, never from website locale."""
    whisper = Client("hf-audio/whisper-large-v3", verbose=False)
    endpoint = _whisper_transcription_endpoint(whisper)
    result = whisper.predict(
        handle_file(reference_audio),
        "transcribe",
        **({"api_name": endpoint} if isinstance(endpoint, str) else {"fn_index": endpoint}),
    )
    transcript = result[0] if isinstance(result, (list, tuple)) and result else result
    if not isinstance(transcript, str) or len(transcript.strip()) < 12:
        raise gr.Error(
            "Could not detect the language from this audio. Upload a clearer sample with at least 10 seconds of speech. "
            "/ Não foi possível detectar o idioma. Envie uma amostra mais nítida com pelo menos 10 segundos de fala."
        )
    from langid import classify
    detected, _score = classify(transcript)
    language = VOICE_LANGUAGE_CODES.get(detected)
    if not language:
        raise gr.Error(
            "The reference audio language is not supported by this voice model. Supported languages include English, Portuguese, Spanish, French, German, Italian, Polish, Turkish, Russian, Dutch, Czech, Arabic, Chinese, Japanese, Korean, and Hungarian. "
            "/ O idioma do áudio de referência não é compatível com este modelo."
        )
    return language


def clone_voice(prompt: str, reference_audio: str):
    """Detect the reference speech language, then clone it with multilingual XTTS."""
    prompt = (prompt or "").strip()
    if not prompt or len(prompt) > 1500:
        raise gr.Error("Enter text between 1 and 1500 characters. / Digite um texto de 1 a 1500 caracteres.")
    safe_reference_audio = _validated_reference_audio_path(reference_audio)
    _validate_reference_audio_duration(safe_reference_audio)
    try:
        language = _detect_reference_language(safe_reference_audio)
        client = Client("Nymbo/Voice-Clone-Multilingual", verbose=False)
        result = client.predict(
            prompt,
            handle_file(safe_reference_audio),
            language,
            api_name="/predict",
        )
        first = result[0] if isinstance(result, (list, tuple)) and result else result
        if isinstance(first, dict):
            first = first.get("path") or first.get("url")
        if isinstance(first, (list, tuple)) and first:
            first = first[0]
        if not isinstance(first, str) or not first:
            raise gr.Error("The voice-cloning Space returned no audio. / O Space de clonagem não retornou áudio.")
        return first
    except gr.Error:
        raise
    except Exception as exc:
        print(f"[voice-clone-proxy] {type(exc).__name__}: {exc}", flush=True)
        raise gr.Error(
            "Voice cloning or reference-language detection is temporarily unavailable. Try a clearer sample with at least 10 seconds of speech. "
            "/ A clonagem ou detecção do idioma está temporariamente indisponível. Tente depois com uma amostra nítida de pelo menos 10 segundos."
        ) from exc


with gr.Blocks(title="ErikrafT AI — FLUX + Qwythos", delete_cache=(3600, 86400)) as demo:
    gr.Markdown(
        "# ErikrafT AI — Image + Text to Image\n"
        "Choose FLUX for text-to-image generation, or upload a reference image and instructions "
        "to let Qwythos interpret the request before FLUX edits the actual source image at low strength. "
        "Each model runs in a separate GPU request to stay within the provider's duration limit."
    )
    gr.Markdown(
        "**Protected experimental models / Modelos experimentais protegidos:** "
        "Use the authenticated ErikrafT AI website for Qwen text and Cosmos video. "
        "These endpoints require a server-side shared secret and intentionally reject direct calls "
        "from this public Space interface. Do not put secrets into browser fields. / "
        "Use o site ErikrafT AI autenticado para texto Qwen e vídeo Cosmos. Esses endpoints exigem "
        "um segredo compartilhado no servidor e rejeitam chamadas diretas nesta interface pública. "
        "Nunca coloque segredos em campos do navegador."
    )

    with gr.Tab("FLUX text-to-image"):
        prompt_image = gr.Textbox(label="Prompt", lines=4, max_lines=8)
        with gr.Row():
            width = gr.Dropdown(choices=[768, 1024], value=768, label="Width")
            height = gr.Dropdown(choices=[768, 1024], value=768, label="Height")
            steps = gr.Dropdown(choices=[20, 28], value=20, label="Inference steps")
        image_button = gr.Button("Generate image")
        image_output = gr.Image(type="pil", label="Generated image")
        image_button.click(
            generate_image,
            [prompt_image, width, height, steps],
            image_output,
            api_name="generate_image",
        )

    with gr.Tab("Qwythos image + text-to-image"):
        reference_image = gr.Image(type="pil", label="Reference image")
        image_prompt = gr.Textbox(
            label="Instructions for the reference image",
            lines=4,
            max_lines=8,
        )
        with gr.Row():
            image_width = gr.Dropdown(choices=[768, 1024], value=768, label="Output width")
            image_height = gr.Dropdown(choices=[768, 1024], value=768, label="Output height")
            image_steps = gr.Dropdown(choices=[20, 28], value=20, label="FLUX inference steps")
        image_language = gr.Radio(
            choices=[("Português (Brasil)", "pt-BR"), ("English", "en")],
            value="pt-BR",
            label="Prompt language",
        )
        interpreted_prompt = gr.Textbox(visible=False, label="Interpreted generation prompt")
        interpret_button = gr.Button("Interpret image + instructions and generate")
        image_output = gr.Image(type="pil", label="Generated image (FLUX)")
        interpret_button.click(
            generate_image_from_image,
            [image_prompt, reference_image, image_language],
            interpreted_prompt,
            api_name="generate_image_from_image",
        ).then(
            generate_image_from_reference,
            [interpreted_prompt, reference_image, image_width, image_height, image_steps],
            image_output,
            api_name="generate_image_from_image_render",
        )

    with gr.Tab("Voice cloning / Clonagem de voz"):
        gr.Markdown(
            "Whisper transcribes the reference sample to detect its spoken language, then multilingual XTTS-v2 "
            "synthesizes your text in that detected language—not the website locale. For best results, use a clear "
            "recording with at least 10 seconds of speech. Supported languages include English, Portuguese, Spanish, "
            "French, German, Italian, Polish, Turkish, Russian, Dutch, Czech, Arabic, Chinese, Japanese, Korean, and "
            "Hungarian. Use only audio you own or are authorized to use. / "
            "O Whisper transcreve a amostra de referência para detectar o idioma falado; depois, o XTTS-v2 multilíngue "
            "sintetiza o texto nesse idioma — não no idioma do site. Para melhores resultados, use uma gravação nítida "
            "com pelo menos 10 segundos de fala. Os idiomas compatíveis incluem inglês, português, espanhol, francês, "
            "alemão, italiano, polonês, turco, russo, neerlandês, tcheco, árabe, chinês, japonês, coreano e húngaro. "
            "Use somente áudios próprios ou para os quais você tenha autorização."
        )
        voice_prompt = gr.Textbox(
            label="Text to synthesize / Texto para sintetizar",
            lines=4,
            max_lines=8,
            max_length=1500,
        )
        voice_reference = gr.Audio(
            sources=["upload", "microphone"],
            type="filepath",
            format="wav",
            label="Reference audio / Áudio de referência (minimum 10 seconds / mínimo de 10 segundos)",
        )
        voice_button = gr.Button("Clone voice / Clonar voz")
        voice_output = gr.Audio(type="filepath", label="Generated audio / Áudio gerado")
        voice_button.click(clone_voice, [voice_prompt, voice_reference], voice_output, api_name="clone_voice")

    with gr.Tab("Cosmos3 Nano text-to-video", visible=False):
        gr.Markdown(
            "Experimental short video generation. Disabled until ENABLE_COSMOS_VIDEO is set and GPU/disk checks pass. "
            "Initial outputs are restricted to 16 frames at 256×256."
        )
        video_prompt = gr.Textbox(label="Video prompt", lines=4, max_lines=8, max_length=1500)
        experimental_api_secret = gr.Textbox(value="", visible=False, label="Internal API credential")
        video_button = gr.Button("Generate short video")
        video_output = gr.Video(label="Generated video")
        video_button.click(generate_video, [video_prompt, experimental_api_secret], video_output, api_name="generate_video")

    with gr.Tab("Qwen3.8 text assistant", visible=False):
        gr.Markdown(
            "Experimental CPU-only GGUF inference using the low-memory RVN-IQ2_XS quantization. "
            "Responses may be slower and quality is reduced versus larger quantizations."
        )
        text_prompt = gr.Textbox(label="Message", lines=4, max_lines=8, max_length=1500)
        text_language = gr.Radio(
            choices=[("Português (Brasil)", "pt-BR"), ("English", "en")],
            value="pt-BR",
            label="Response language",
        )
        text_tools_json = gr.Textbox(value="[]", visible=False, label="MCP tools JSON")
        text_messages_json = gr.Textbox(value="", visible=False, label="Chat messages JSON")
        text_button = gr.Button("Ask Qwen")
        text_output = gr.Textbox(label="Qwen response", lines=12, max_lines=24, interactive=False)
        text_button.click(generate_text, [text_prompt, text_language, experimental_api_secret, text_tools_json, text_messages_json], text_output, api_name="generate_text")

demo.queue()
demo.launch()
