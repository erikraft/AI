import gradio as gr
import spaces
import torch
from diffusers import DiffusionPipeline

MODEL_ID = "aoxo/flux.1dev-abliterated"

# Load weights once on CPU. ZeroGPU allocates the GPU only while the decorated
# function is running; this avoids reserving GPU memory between requests.
pipe = DiffusionPipeline.from_pretrained(
    MODEL_ID,
    torch_dtype=torch.bfloat16,
)

@spaces.GPU(duration=120)
def generate_image(prompt: str, width: int = 768, height: int = 768, steps: int = 20):
    prompt = (prompt or "").strip()
    if not prompt or len(prompt) > 1500:
        raise gr.Error("Prompt must contain 1–1500 characters.")
    if (int(width), int(height)) not in {(768, 768), (1024, 768), (768, 1024)}:
        raise gr.Error("Unsupported image dimensions.")
    if int(steps) not in {20, 28}:
        raise gr.Error("Unsupported inference step count.")

    pipe.to("cuda")
    try:
        result = pipe(
            prompt,
            width=int(width),
            height=int(height),
            num_inference_steps=int(steps),
        )
        return result.images[0]
    finally:
        pipe.to("cpu")
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

demo = gr.Interface(
    fn=generate_image,
    inputs=[
        gr.Textbox(label="Prompt", lines=4, max_lines=8),
        gr.Dropdown(choices=[768, 1024], value=768, label="Width"),
        gr.Dropdown(choices=[768, 1024], value=768, label="Height"),
        gr.Dropdown(choices=[20, 28], value=20, label="Inference steps"),
    ],
    outputs=gr.Image(type="pil", label="Generated image"),
    title="ErikrafT AI — FLUX Image Generation",
    description="Uses aoxo/flux.1dev-abliterated. Free GPU availability and quota depend on Hugging Face.",
    api_name="generate_image",
)
demo.queue()
demo.launch()
