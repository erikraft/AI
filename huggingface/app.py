import gc
import gradio as gr
import spaces
import torch
from diffusers import DiffusionPipeline
from PIL import Image
from transformers import AutoModelForCausalLM, AutoTokenizer, AutoModelForImageTextToText, AutoProcessor

FLUX_MODEL_ID = "aoxo/flux.1dev-abliterated"
QWYTHOS_MODEL_ID = "fluffy12222/Qwythos-9B-Claude-Mythos-5-1M-heretic-abliterated"
pipe = None
qwythos_model = None
qwythos_tokenizer = None
qwythos_vision_model = None
qwythos_processor = None

def _clear_models(except_model: str):
    global pipe, qwythos_model, qwythos_tokenizer, qwythos_vision_model, qwythos_processor
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
        if qwythos_model is not None:
            del qwythos_model
            qwythos_model = None
        if qwythos_tokenizer is not None:
            del qwythos_tokenizer
            qwythos_tokenizer = None
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

def _load_flux():
    global pipe
    _clear_models("flux")
    if pipe is None:
        pipe = DiffusionPipeline.from_pretrained(FLUX_MODEL_ID, torch_dtype=torch.bfloat16)
    return pipe

def _load_qwythos():
    global qwythos_model, qwythos_tokenizer, qwythos_vision_model, qwythos_processor
    _clear_models("qwythos")
    if qwythos_vision_model is not None:
        del qwythos_vision_model
        qwythos_vision_model = None
    if qwythos_processor is not None:
        del qwythos_processor
        qwythos_processor = None
    if qwythos_model is None or qwythos_tokenizer is None:
        qwythos_tokenizer = AutoTokenizer.from_pretrained(QWYTHOS_MODEL_ID)
        qwythos_model = AutoModelForCausalLM.from_pretrained(
            QWYTHOS_MODEL_ID, torch_dtype=torch.bfloat16, low_cpu_mem_usage=True
        )
    return qwythos_model, qwythos_tokenizer

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
    image_pipe.to("cuda")
    try:
        result = image_pipe(prompt, width=int(width), height=int(height), num_inference_steps=int(steps))
        return result.images[0]
    finally:
        image_pipe.to("cpu")
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

@spaces.GPU(duration=300)
def generate_image_from_image(prompt: str, reference_image: Image.Image, width: int = 768, height: int = 768, steps: int = 20, language: str = "pt-BR"):
    """Experimental: Qwythos interprets the image and text; FLUX renders the final image."""
    global qwythos_vision_model, qwythos_processor
    prompt = (prompt or "").strip()
    if not prompt or len(prompt) > 1500:
        raise gr.Error("Prompt must contain 1–1500 characters.")
    if reference_image is None:
        raise gr.Error("Upload a reference image.")
    if (int(width), int(height)) not in {(768, 768), (1024, 768), (768, 1024)} or int(steps) not in {20, 28}:
        raise gr.Error("Unsupported image settings.")
    language = "en" if str(language).lower().startswith("en") else "pt-BR"
    _clear_models("qwythos")
    if qwythos_model is not None:
        del qwythos_model
        qwythos_model = None
    if qwythos_tokenizer is not None:
        del qwythos_tokenizer
        qwythos_tokenizer = None
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    if qwythos_vision_model is None or qwythos_processor is None:
        try:
            qwythos_processor = AutoProcessor.from_pretrained(QWYTHOS_MODEL_ID)
            qwythos_vision_model = AutoModelForImageTextToText.from_pretrained(
                QWYTHOS_MODEL_ID, torch_dtype=torch.bfloat16, low_cpu_mem_usage=True
            )
        except Exception as exc:
            qwythos_processor = None
            qwythos_vision_model = None
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            raise gr.Error("Qwythos multimodal loading failed; check Transformers/model compatibility in Space logs: " + str(exc)[:300])
    qwythos_vision_model.to("cuda")
    image = reference_image.convert("RGB")
    image.thumbnail((1536, 1536))
    language_name = "English" if language == "en" else "Brazilian Portuguese"
    messages = [{"role": "user", "content": [
        {"type": "image", "image": image},
        {"type": "text", "text": (
            "Use the reference image and user instructions to write a detailed image-generation prompt. "
            "Describe subject, composition, colors, lighting, setting, and style; incorporate requested changes. "
            "Return only the final prompt in " + language_name + ". Do not claim an image has already been generated.\n\n"
            "User instructions: " + prompt
        )}
    ]}]
    inputs = None
    try:
        chat_text = qwythos_processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        inputs = qwythos_processor(text=[chat_text], images=[image], return_tensors="pt").to("cuda")
        with torch.inference_mode():
            output = qwythos_vision_model.generate(**inputs, max_new_tokens=260, do_sample=False)
        generated_prompt = qwythos_processor.batch_decode(
            output[:, inputs["input_ids"].shape[-1]:], skip_special_tokens=True
        )[0].strip()
        if not generated_prompt:
            raise gr.Error("Qwythos did not return a usable image prompt.")
    except gr.Error:
        raise
    except Exception as exc:
        raise gr.Error("Qwythos could not process this image+text input; check Space logs: " + str(exc)[:300])
    finally:
        if inputs is not None:
            del inputs
        qwythos_vision_model.to("cpu")
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    image_pipe = _load_flux()
    image_pipe.to("cuda")
    try:
        result = image_pipe(generated_prompt[:1500], width=int(width), height=int(height), num_inference_steps=int(steps))
        return result.images[0]
    finally:
        image_pipe.to("cpu")
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

@spaces.GPU(duration=300)
def generate_prompt(prompt: str, language: str = "pt-BR"):
    prompt = (prompt or "").strip()
    if not prompt or len(prompt) > 1500:
        raise gr.Error("Prompt must contain 1–1500 characters.")
    language = "en" if str(language).lower().startswith("en") else "pt-BR"
    model, tokenizer = _load_qwythos()
    model.to("cuda")
    inputs = None
    instruction = (
        "Rewrite and improve the user's image-generation prompt. Return only the improved prompt, "
        "with concrete visual details, subject, composition, lighting, environment, and style. "
        "Do not generate an image, explanations, headings, or safety commentary. Keep the user's intent. "
        f"Write the result in {'English' if language == 'en' else 'Brazilian Portuguese'}.\n\n"
        f"User prompt:\n{prompt}\n\nImproved image prompt:"
    )
    try:
        inputs = tokenizer(instruction, return_tensors="pt").to("cuda")
        with torch.inference_mode():
            output = model.generate(**inputs, max_new_tokens=220, do_sample=True, temperature=0.7,
                                    top_p=0.9, pad_token_id=tokenizer.eos_token_id)
        generated = tokenizer.decode(output[0][inputs["input_ids"].shape[-1]:], skip_special_tokens=True).strip()
        if not generated:
            raise gr.Error("Qwythos returned an empty prompt.")
        return generated[:1500]
    finally:
        model.to("cpu")
        del inputs
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

with gr.Blocks(title="ErikrafT AI — FLUX + Qwythos") as demo:
    gr.Markdown("# ErikrafT AI — Model Space\nSelect FLUX for image generation or Qwythos for prompt improvement. Qwythos returns text, not an image.")
    with gr.Tab("FLUX image generation"):
        prompt_image = gr.Textbox(label="Prompt", lines=4, max_lines=8)
        with gr.Row():
            width = gr.Dropdown(choices=[768, 1024], value=768, label="Width")
            height = gr.Dropdown(choices=[768, 1024], value=768, label="Height")
            steps = gr.Dropdown(choices=[20, 28], value=20, label="Inference steps")
        image_button = gr.Button("Generate image")
        image_output = gr.Image(type="pil", label="Generated image")
        image_button.click(generate_image, [prompt_image, width, height, steps], image_output, api_name="generate_image")
    with gr.Tab("Qwythos prompt assistant"):
        prompt_text = gr.Textbox(label="Image prompt to improve", lines=4, max_lines=8)
        language = gr.Radio(choices=[("Português (Brasil)", "pt-BR"), ("English", "en")], value="pt-BR", label="Output language")
        prompt_button = gr.Button("Improve prompt with Qwythos")
        text_output = gr.Textbox(label="Improved prompt", lines=8)
        prompt_button.click(generate_prompt, [prompt_text, language], text_output, api_name="generate_prompt")
    with gr.Tab("Experimental Qwythos image + text"):
        reference_image = gr.Image(type="pil", label="Reference image")
        image_prompt = gr.Textbox(label="Instructions for the reference image", lines=4, max_lines=8)
        with gr.Row():
            image_width = gr.Dropdown(choices=[768, 1024], value=768, label="Width")
            image_height = gr.Dropdown(choices=[768, 1024], value=768, label="Height")
            image_steps = gr.Dropdown(choices=[20, 28], value=20, label="FLUX steps")
        image_language = gr.Radio(choices=[("Português (Brasil)", "pt-BR"), ("English", "en")], value="pt-BR", label="Output language")
        image_button = gr.Button("Interpret image + text and generate")
        image_output = gr.Image(type="pil", label="Generated image (FLUX)")
        image_button.click(generate_image_from_image, [image_prompt, reference_image, image_width, image_height, image_steps, image_language], image_output, api_name="generate_image_from_image")

demo.queue()
demo.launch()
