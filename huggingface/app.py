import gc

import gradio as gr
import spaces
import torch
from diffusers import DiffusionPipeline
from PIL import Image
from transformers import AutoModelForImageTextToText, AutoProcessor

FLUX_MODEL_ID = "aoxo/flux.1dev-abliterated"
QWYTHOS_MODEL_ID = "fluffy12222/Qwythos-9B-Claude-Mythos-5-1M-heretic-abliterated"
MAX_QWYTHOS_GPU_SECONDS = 300

pipe = None
qwythos_vision_model = None
qwythos_processor = None


def _clear_models(except_model: str):
    global pipe, qwythos_vision_model, qwythos_processor

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

    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


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


with gr.Blocks(title="ErikrafT AI — FLUX + Qwythos") as demo:
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

demo.queue()
demo.launch()
