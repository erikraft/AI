import gc

import gradio as gr
import spaces
import torch
from diffusers import DiffusionPipeline
from transformers import AutoModelForCausalLM, AutoTokenizer

FLUX_MODEL_ID = "aoxo/flux.1dev-abliterated"
QWYTHOS_MODEL_ID = "fluffy12222/Qwythos-9B-Claude-Mythos-5-1M-heretic-abliterated"

flux_pipe = None
qwythos_model = None
qwythos_tokenizer = None


def _release_gpu_memory():
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def _unload_flux():
    global flux_pipe
    if flux_pipe is not None:
        del flux_pipe
        flux_pipe = None
    _release_gpu_memory()


def _unload_qwythos():
    global qwythos_model, qwythos_tokenizer
    if qwythos_model is not None:
        del qwythos_model
        qwythos_model = None
    if qwythos_tokenizer is not None:
        del qwythos_tokenizer
        qwythos_tokenizer = None
    _release_gpu_memory()


def _load_flux():
    global flux_pipe
    _unload_qwythos()
    if flux_pipe is None:
        flux_pipe = DiffusionPipeline.from_pretrained(
            FLUX_MODEL_ID,
            torch_dtype=torch.bfloat16,
        )
    return flux_pipe


def _load_qwythos():
    global qwythos_model, qwythos_tokenizer
    _unload_flux()
    if qwythos_model is None or qwythos_tokenizer is None:
        qwythos_tokenizer = AutoTokenizer.from_pretrained(QWYTHOS_MODEL_ID)
        qwythos_model = AutoModelForCausalLM.from_pretrained(
            QWYTHOS_MODEL_ID,
            torch_dtype=torch.bfloat16,
            low_cpu_mem_usage=True,
        )
    return qwythos_model, qwythos_tokenizer


def _validate_prompt(prompt: str) -> str:
    prompt = (prompt or "").strip()
    if not prompt or len(prompt) > 1500:
        raise gr.Error("Prompt must contain 1–1500 characters.")
    return prompt


def _language_name(language: str) -> str:
    return "English" if str(language).lower().startswith("en") else "Brazilian Portuguese"


@spaces.GPU(duration=300)
def generate_image(prompt: str, width: int = 768, height: int = 768, steps: int = 20):
    prompt = _validate_prompt(prompt)
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
            "FLUX ran out of GPU memory. Try again later or use a Space with more capable hardware."
        ) from exc
    finally:
        try:
            image_pipe.to("cpu")
        except Exception:
            pass
        _release_gpu_memory()


@spaces.GPU(duration=300)
def generate_prompt(prompt: str, language: str = "pt-BR"):
    prompt = _validate_prompt(prompt)
    model, tokenizer = _load_qwythos()
    instruction = (
        "Rewrite and improve the user's image-generation prompt. Return only the improved prompt, "
        "with concrete visual details, subject, composition, lighting, environment, and style. "
        "Do not generate an image, explanations, headings, or safety commentary. Keep the user's intent. "
        f"Write the result in {_language_name(language)}.\n\n"
        f"User prompt:\n{prompt}\n\nImproved image prompt:"
    )
    inputs = None
    try:
        model.to("cuda")
        inputs = tokenizer(instruction, return_tensors="pt").to("cuda")
        with torch.inference_mode():
            output = model.generate(
                **inputs,
                max_new_tokens=220,
                do_sample=True,
                temperature=0.7,
                top_p=0.9,
                pad_token_id=tokenizer.eos_token_id,
            )
        generated = tokenizer.decode(
            output[0][inputs["input_ids"].shape[-1]:],
            skip_special_tokens=True,
        ).strip()
        if not generated:
            raise gr.Error("Qwythos returned an empty prompt.")
        return generated[:1500]
    except torch.cuda.OutOfMemoryError as exc:
        raise gr.Error(
            "Qwythos ran out of GPU memory. Its weights need substantial memory; this Space may require more capable hardware."
        ) from exc
    finally:
        if inputs is not None:
            del inputs
        try:
            model.to("cpu")
        except Exception:
            pass
        _release_gpu_memory()


with gr.Blocks(title="ErikrafT AI — FLUX + Qwythos") as demo:
    gr.Markdown(
        "# ErikrafT AI — Model Space\n"
        "Select FLUX to generate an image, or Qwythos to improve a text prompt. "
        "Qwythos is a text-only assistant here; FLUX renders images."
    )
    with gr.Tab("FLUX image generation"):
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
    with gr.Tab("Qwythos prompt assistant"):
        prompt_text = gr.Textbox(label="Image prompt to improve", lines=4, max_lines=8)
        language = gr.Radio(
            choices=[("Português (Brasil)", "pt-BR"), ("English", "en")],
            value="pt-BR",
            label="Output language",
        )
        prompt_button = gr.Button("Improve prompt with Qwythos")
        text_output = gr.Textbox(label="Improved prompt", lines=8)
        prompt_button.click(
            generate_prompt,
            [prompt_text, language],
            text_output,
            api_name="generate_prompt",
        )

demo.queue()
demo.launch()
