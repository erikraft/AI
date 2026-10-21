import gc
import hmac
import os
import shutil
import tempfile

import gradio as gr
import spaces
import torch
from diffusers import DiffusionPipeline
from PIL import Image
from transformers import AutoModelForImageTextToText, AutoProcessor

FLUX_MODEL_ID = "aoxo/flux.1dev-abliterated"
QWYTHOS_MODEL_ID = "fluffy12222/Qwythos-9B-Claude-Mythos-5-1M-heretic-abliterated"
COSMOS_MODEL_ID = "DuoNeural/Cosmos3-Nano-Abliterated"
QWEN_MODEL_ID = "0bserverx/Qwen3.8-27B-Heretic-Abliterated-Uncensored-GGUF"
ENABLE_COSMOS_VIDEO = os.getenv("ENABLE_COSMOS_VIDEO", "").strip().lower() in {"1", "true", "yes"}
ENABLE_QWEN_TEXT = os.getenv("ENABLE_QWEN_TEXT", "").strip().lower() in {"1", "true", "yes"}
QWEN_GGUF_FILE = "RVN-IQ2_XS.gguf"
# The deployed ZeroGPU request surfaced 300 seconds as a 450-second reservation.
# Keep Qwythos below the observed 300-second ceiling, with headroom for scheduler overhead.
MAX_QWYTHOS_GPU_SECONDS = 180

pipe = None
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
    global pipe, qwythos_vision_model, qwythos_processor, cosmos_pipe, qwen_text_model
    if except_model != "flux" and pipe is not None:
        del pipe
        pipe = None
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


def _load_flux():
    global pipe
    _clear_models("flux")
    if pipe is None:
        pipe = DiffusionPipeline.from_pretrained(
            FLUX_MODEL_ID,
            torch_dtype=torch.bfloat16,
        )
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
    language = "en" if str(language).lower().startswith("en") else "pt-BR"

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
        language_name = "English" if language == "en" else "Brazilian Portuguese"
        messages = [{
            "role": "user",
            "content": [
                {"type": "image", "image": image},
                {
                    "type": "text",
                    "text": (
                        "Use the reference image and user instructions to write a detailed image-generation prompt. "
                        "Describe the subject, composition, colors, lighting, setting, and style, and incorporate the "
                        "requested changes. Return only the final prompt in " + language_name + ". "
                        "Do not claim that an image has already been generated.\n\n"
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
    if cached_size_gib < 28 and free_disk_gib < 36:
        raise gr.Error(
            f"Cosmos needs tens of gigabytes of model cache; only {free_disk_gib:.1f} GiB free disk space is available and the detected model cache is {cached_size_gib:.1f} GiB."
        )
    # Free memory occupied by other models before measuring VRAM available to Cosmos.
    _clear_models("cosmos")
    total_gib = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
    free_gib = torch.cuda.mem_get_info()[0] / (1024 ** 3)
    if total_gib < 48 or free_gib < 40:
        raise gr.Error(
            f"Cosmos needs roughly 48 GB VRAM. This runtime reports {total_gib:.1f} GiB total and {free_gib:.1f} GiB free; refusing to load to reduce OOM risk."
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


def generate_text(prompt: str, language: str = "pt-BR", api_secret: str = ""):
    """CPU-only GGUF inference; intentionally has no GPU offload."""
    global qwen_text_model
    prompt = (prompt or "").strip()
    if not ENABLE_QWEN_TEXT:
        raise gr.Error("Qwen text generation is disabled. Enable ENABLE_QWEN_TEXT only after validating system RAM and disk.")
    _authorize_experimental_api(api_secret)
    if not prompt or len(prompt) > 1500:
        raise gr.Error("Prompt must contain 1–1500 characters.")
    if not _has_cached_repo("models--0bserverx--Qwen3.8-27B-Heretic-Abliterated-Uncensored-GGUF") and _disk_free_gib() < 11:
        raise gr.Error(f"Qwen needs about 9.1 GB for its selected GGUF plus cache overhead; only {_disk_free_gib():.1f} GiB free disk space is available.")
    # Release other models before measuring RAM available for the CPU-only Qwen model.
    _clear_models("qwen")
    available_ram = _available_ram_gib()
    if qwen_text_model is None and available_ram < 12:
        raise gr.Error(f"Qwen CPU inference needs roughly 12 GiB free RAM; only {available_ram:.1f} GiB appears available.")
    try:
        if qwen_text_model is None:
            from llama_cpp import Llama
            qwen_text_model = Llama.from_pretrained(
                repo_id=QWEN_MODEL_ID,
                filename=QWEN_GGUF_FILE,
                n_ctx=2048,
                n_batch=128,
                n_threads=max(2, min(8, os.cpu_count() or 2)),
                n_gpu_layers=0,
                verbose=False,
            )
        language_name = "Brazilian Portuguese" if str(language).lower().startswith("pt") else "English"
        result = qwen_text_model.create_chat_completion(
            messages=[
                {"role": "system", "content": "Answer helpfully in " + language_name + ". You are a third-party model running inside ErikrafT AI; do not claim ErikrafT created you."},
                {"role": "user", "content": prompt},
            ],
            max_tokens=512,
            temperature=0.7,
        )
        answer = result["choices"][0]["message"]["content"].strip()
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


with gr.Blocks(title="ErikrafT AI — FLUX + Qwythos", delete_cache=(3600, 86400)) as demo:
    gr.Markdown(
        "# ErikrafT AI — Image + Text to Image\n"
        "Choose FLUX for text-to-image generation, or upload a reference image and instructions "
        "to let Qwythos interpret the request before FLUX renders the result. "
        "Each model runs in a separate GPU request to stay within the provider's duration limit."
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
            generate_image,
            [interpreted_prompt, image_width, image_height, image_steps],
            image_output,
            api_name="generate_image_from_image_render",
        )

    with gr.Tab("Cosmos3 Nano text-to-video"):
        gr.Markdown(
            "Experimental short video generation. Disabled until ENABLE_COSMOS_VIDEO is set and GPU/disk checks pass. "
            "Initial outputs are restricted to 16 frames at 256×256."
        )
        video_prompt = gr.Textbox(label="Video prompt", lines=4, max_lines=8, max_length=1500)
        experimental_api_secret = gr.Textbox(value="", visible=False, label="Internal API credential")
        video_button = gr.Button("Generate short video")
        video_output = gr.Video(label="Generated video")
        video_button.click(generate_video, [video_prompt, experimental_api_secret], video_output, api_name="generate_video")

    with gr.Tab("Qwen3.8 text assistant"):
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
        text_button = gr.Button("Ask Qwen")
        text_output = gr.Textbox(label="Qwen response", lines=12, max_lines=24, interactive=False)
        text_button.click(generate_text, [text_prompt, text_language, experimental_api_secret], text_output, api_name="generate_text")

demo.queue()
demo.launch()
