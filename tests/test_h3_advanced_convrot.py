"""CPU regression for the native ConvRot/LoRA boundary used by Viggle."""

import ast
import json
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]


def pipeline_with_transformer(transformer):
    # Exercise the actual callback without importing/allocating the H3 pipeline.
    path = ROOT / "app/models/h3_advanced/pipeline.py"
    tree = ast.parse(path.read_text())
    pipeline = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == "MiniMaxH3Pipeline")
    methods = [node for node in pipeline.body if isinstance(node, ast.FunctionDef) and node.name == "finalize_loras"]
    assert len(methods) == 1, "H3 Advanced must preserve native ConvRot math after MMGP attaches LoRAs"
    namespace = {}
    exec(compile(ast.Module(body=methods, type_ignores=[]), str(path), "exec"), namespace)
    instance = type("PipelineCallback", (), namespace)()
    instance.transformer = transformer
    return instance


def small_convrot_model():
    torch = pytest.importorskip("torch")
    offload = pytest.importorskip("mmgp.offload")
    from mmgp import quant_router
    from shared.qtypes import int8_convrot

    quant_router.register_handler("shared.qtypes.int8_convrot")
    descriptor = torch.tensor(list(json.dumps({"format": "int8_tensorwise", "convrot": True, "convrot_groupsize": 4}).encode()), dtype=torch.uint8)
    weight = torch.tensor([[1, 0, 0, 0], [0, 1, 0, 0]], dtype=torch.int8)
    model = torch.nn.Module()
    model.linear = torch.nn.Linear(4, 2, bias=False, dtype=torch.float32)
    offload.load_model_data(model, ({"linear.weight": weight, "linear.weight_scale": torch.ones(2), "linear.comfy_quant": descriptor}, None), default_dtype=torch.float32, verboseLevel=0)
    return torch, offload, int8_convrot, model, weight.float()


def attach_distillation(torch, offload, model):
    manager = offload.offload.__new__(offload.offload)
    module = model.linear
    module._mm_manager = manager
    module.forward = manager.hook_lora(module, model, "transformer", {}, {}, "linear")
    lora_a = torch.tensor([[1., 0., -1., .5]])
    lora_b = torch.tensor([[.25], [-.75]])
    module._mm_lora_data["distillation_GPU"] = [lora_a, lora_b, None, None, 1., {"type": "lora"}]
    model._loras_active_adapters = ["distillation"]
    model._loras_scaling = {"distillation": 1.0}
    return lora_a, lora_b


@pytest.mark.parametrize("strength", [0., .5, 1.])
def test_viggle_convrot_lora_uses_native_base_and_unrotated_adapter(strength):
    torch, offload, convrot, model, weight = small_convrot_model()
    lora_a, lora_b = attach_distillation(torch, offload, model)
    model._loras_scaling["distillation"] = strength
    x = torch.tensor([[1., 2., 4., 8.]])
    base = torch.nn.functional.linear(convrot._rotate_activation(x, 4), weight)
    update = ((x @ lora_a.T) @ lora_b.T) * strength
    wrong_unrotated = torch.nn.functional.linear(x, weight) + update
    with torch.inference_mode():
        # This callback is the same one wgp invokes after loading system LoRAs.
        pipeline_with_transformer(model).finalize_loras()
        actual = model.linear(x)
    assert torch.allclose(actual, base + update)
    assert not torch.allclose(actual, wrong_unrotated)


def test_finalize_reentry_keeps_live_adapter_selection_and_step_scaling():
    torch, offload, convrot, model, weight = small_convrot_model()
    lora_a, lora_b = attach_distillation(torch, offload, model)
    pipeline = pipeline_with_transformer(model)
    x = torch.tensor([[1., 2., 4., 8.]])
    base = torch.nn.functional.linear(convrot._rotate_activation(x, 4), weight)
    update = (x @ lora_a.T) @ lora_b.T
    with torch.inference_mode():
        pipeline.finalize_loras()
        pipeline.finalize_loras()
        assert torch.allclose(model.linear(x), base + update)
        model._loras_scaling["distillation"] = [.5, 0.]
        assert torch.allclose(model.linear(x), base + .5 * update)
        model._lora_step_no = 1
        assert torch.allclose(model.linear(x), base)
        model._loras_active_adapters = []
        assert torch.allclose(model.linear(x), base)


def test_finalize_preserves_unhooked_convrot_and_ordinary_linear():
    torch, _, _, model, _ = small_convrot_model()
    model.ordinary = torch.nn.Linear(4, 2)
    forwards = (model.linear.forward, model.ordinary.forward)
    pipeline_with_transformer(model).finalize_loras()
    assert (model.linear.forward, model.ordinary.forward) == forwards
