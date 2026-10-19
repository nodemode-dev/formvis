import hashlib
import json
import os
import shutil
import threading
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from . import jobs
from .paths import DATA_DIR, MODELS_DIR

router = APIRouter(prefix="/api/models", tags=["models"])
ROOT = MODELS_DIR
LEGACY = DATA_DIR / "models"
# BG2: models shipped inside the engine build, so the default cutout works on
# a machine that has downloaded nothing. A file in the person's model folder
# always takes precedence; the bundle only answers when the folder is empty.
# Resolved the way effect_packages resolves its library: beside this module,
# which under PyInstaller lands at _MEIPASS/app/bundled_models via freeze.py.
BUNDLED = Path(__file__).resolve().parent / "bundled_models"   # none in formvis: models are downloaded


def model_file(name: str) -> Path:
    """Where a model file actually is: the model folder, else the bundle."""
    path = ROOT / name
    if path.is_file() and path.stat().st_size > (1024 if path.suffix in (".onnx", ".bin", ".pth", ".safetensors") else 0):
        return path
    bundled = BUNDLED / name
    if bundled.is_file():
        return bundled
    return path


# BG6: one ordering for every ONNX Runtime session the engine opens. The
# platform accelerator comes first where its provider is present (Core ML on
# macOS in the standard wheel, DirectML on Windows via onnxruntime-directml,
# CUDA on Linux via onnxruntime-gpu), and the CPU provider is always the
# floor, so a machine with nothing extra runs everything unchanged.
PROVIDERS = ("CoreMLExecutionProvider", "DmlExecutionProvider", "CUDAExecutionProvider", "CPUExecutionProvider")


def providers() -> list[str]:
    """The execution providers to hand a session, best first."""
    import onnxruntime as ort

    available = ort.get_available_providers()
    return [name for name in PROVIDERS if name in available] or ["CPUExecutionProvider"]



PINNED: dict[str, str] = {
    # Krea 2's builds and its content filter: the SHA-256 Hugging Face records for each large file at the pinned
    # revision, and for each small one the hash of the file fetched on 27 September 2026
    "krea-2-mlx-q8/.DS_Store": "bb49144c3319391c31ee22524247e886d795c3841d431559557dd3353cf13c29",
    "krea-2-mlx-q8/0.safetensors": "7dac52a29577e965460d4bea51f2b3b5b840e3d784715b2c590f810e4248681a",
    "krea-2-mlx-q8/1.safetensors": "471a58de454f7a04ff9b0ab0f28dbc27900d924d028d336dae92768244be6536",
    "krea-2-mlx-q8/2.safetensors": "b09c1671a3e966cf25eab5c9e464d1dc14b50ba1ecf14b5e9a98c0b1a838f900",
    "krea-2-mlx-q8/3.safetensors": "4318c7d38b17add1b2aacaf1422079c89d63a3d27c67a6bd37af4838727b9cec",
    "krea-2-mlx-q8/4.safetensors": "05c956017ba0dd6bc8c5e582fb867188404608c8660dc7271ab6d8d89c4a6c70",
    "krea-2-mlx-q8/5.safetensors": "6e39d518ec0179ec9aa60bbb5e9452e80624ea3b598c505b516868c756e27ef6",
    "krea-2-mlx-q8/6.safetensors": "2bbb8f18ea9387e2061308e134a08f028027a8216d21d7cd897fc03855f72651",
    "krea-2-mlx-q8/model.safetensors.index.json": "92539c59eab012cb7488fede1ff357edbf5c1245ea65efe875292908a2e4b782",
    "krea-2-mlx-q8/text_encoder/0.safetensors": "6dd135c977fd4a752c53ca06fd9d65ac1a6891a8771a8d65608a7728f2e3b560",
    "krea-2-mlx-q8/text_encoder/1.safetensors": "3b4a1c79423cd2a07bfafece4f542e1660133d66bee7985c09fa0939636675e3",
    "krea-2-mlx-q8/text_encoder/2.safetensors": "bfc931672551062f3f7b66e0c94b779cfa52c499991764d819093329071b4469",
    "krea-2-mlx-q8/text_encoder/3.safetensors": "88996823c97130307ff00b13291782bb26d25bbfd16f0c148249149a96a433b1",
    "krea-2-mlx-q8/text_encoder/model.safetensors.index.json": "79b7c1e303763dec75afa890bd20cfb40c0f0445be3e52e85dda1eac66cac3b5",
    "krea-2-mlx-q8/tokenizer/chat_template.jinja": "3636d0f0bd6bef02654cdffdc447b79cb2cef8ab02cc75267345946291a489e4",
    "krea-2-mlx-q8/tokenizer/tokenizer.json": "be75606093db2094d7cd20f3c2f385c212750648bd6ea4fb2bf507a6a4c55506",
    "krea-2-mlx-q8/tokenizer/tokenizer_config.json": "c871ed314285a377eccf509b906aa5fe015d5e79a3ddab2c198467329127ead6",
    "krea-2-mlx-q8/vae/0.safetensors": "3bc6157dec03fa1b8be8a97efcf6b3fe19d43b4210d369648b4efb0cc940a74c",
    "krea-2-mlx-q8/vae/model.safetensors.index.json": "a5c2f350d7b28c10b45ad16e27320021daf190b30af665b52bbe0288ad814be4",
    "krea-2-mlx-q4/.DS_Store": "fbf84581e26de02330c770e58e34fb36058b753a12c0a2080d129f84e5c8e79c",
    "krea-2-mlx-q4/0.safetensors": "294800e65afa7d727ef1a1402dfea86fd22c55e15a7631cce63ec84774041582",
    "krea-2-mlx-q4/1.safetensors": "ebeba87f73c97778a8975a72f15a8349d4483117d41fa7733da724bf4f7fe6b7",
    "krea-2-mlx-q4/2.safetensors": "30a895386a1fc4159402a24353d69195b87d30904149edaabb9ccae7aab7bf15",
    "krea-2-mlx-q4/3.safetensors": "c324675dced018804b17c41a52a99bb1ff4edd8836b44c610edf5de7cd475ded",
    "krea-2-mlx-q4/model.safetensors.index.json": "0143fce31bfab0d961b52d4690ee4ba6f8cd76cb0a2e04b38f78aeebe2e4e35f",
    "krea-2-mlx-q4/text_encoder/0.safetensors": "4e21e461e115028423a7a7665e3dd9e20c9b2bb3f40e2ee8e213c5fe0bc3d228",
    "krea-2-mlx-q4/text_encoder/1.safetensors": "83c768a56e0d48a47caa62f30dbf6c01d70f20ae22c4f71b7840b0856f91ccc9",
    "krea-2-mlx-q4/text_encoder/2.safetensors": "a03ee8c0084b129dcdedb91fe9295c18c0c8217003c6c5913c04156e82df5712",
    "krea-2-mlx-q4/text_encoder/3.safetensors": "2c274cc1b13f538583999bcb27d322b850109a385e76442575afc692a5832b75",
    "krea-2-mlx-q4/text_encoder/model.safetensors.index.json": "e5173ccee30fc4a6d3522e599196ba9e6470c6cbed9d10c59122d55c48106256",
    "krea-2-mlx-q4/tokenizer/chat_template.jinja": "3636d0f0bd6bef02654cdffdc447b79cb2cef8ab02cc75267345946291a489e4",
    "krea-2-mlx-q4/tokenizer/tokenizer.json": "be75606093db2094d7cd20f3c2f385c212750648bd6ea4fb2bf507a6a4c55506",
    "krea-2-mlx-q4/tokenizer/tokenizer_config.json": "c871ed314285a377eccf509b906aa5fe015d5e79a3ddab2c198467329127ead6",
    "krea-2-mlx-q4/vae/0.safetensors": "b2002a24b9a8227646065a1bd169729968402bda24d83b86fb8981124d324e76",
    "krea-2-mlx-q4/vae/model.safetensors.index.json": "a60148f10bc24b11909537ea960281eaf16a7ee066f2fe2988607dca62fdd5af",
    "krea-2-sdnq-int8/LICENSE.pdf": "b82a2805162bde714a4eb27b9063c4fc3345d08a30be055134a6160e5430ba74",
    "krea-2-sdnq-int8/model_index.json": "7d6c1206e369286df31244670a9a38fc73b077d8f64b4d273abb20ef9a8a8b93",
    "krea-2-sdnq-int8/scheduler/scheduler_config.json": "4d8ea4471195528cdb84fcb8d37cd54ff442b9c02ff74f7d16d0a7a2f14b9467",
    "krea-2-sdnq-int8/text_encoder/config.json": "d85211fccf7d376e1cdd77002464cf34cfce71e990147c8388fa643180e1a7e3",
    "krea-2-sdnq-int8/text_encoder/model.safetensors": "37cae4588e10f282e592dc49fb9944ff09fab5447ce3f705c5451d953b39fa1e",
    "krea-2-sdnq-int8/tokenizer/chat_template.jinja": "3636d0f0bd6bef02654cdffdc447b79cb2cef8ab02cc75267345946291a489e4",
    "krea-2-sdnq-int8/tokenizer/tokenizer.json": "be75606093db2094d7cd20f3c2f385c212750648bd6ea4fb2bf507a6a4c55506",
    "krea-2-sdnq-int8/tokenizer/tokenizer_config.json": "c871ed314285a377eccf509b906aa5fe015d5e79a3ddab2c198467329127ead6",
    "krea-2-sdnq-int8/transformer/config.json": "ac5512b2d684ce619a9500c87158e48712e53bfe1f8fda98be5dc57814b76af0",
    "krea-2-sdnq-int8/transformer/diffusion_pytorch_model-00001-of-00002.safetensors": "4451519f43f91a081fd7d9d881e6c4245759b71cdfa01f8ae9d371e75191c55a",
    "krea-2-sdnq-int8/transformer/diffusion_pytorch_model-00002-of-00002.safetensors": "7060caf00f7b4c724505d9945b1c79ef6fd861ad07dcdea4e06b299a14a6482f",
    "krea-2-sdnq-int8/transformer/diffusion_pytorch_model.safetensors.index.json": "aafab68d94c49ea754bb0dd92870ff93889d64933cdcb72be1a2e68447c4293b",
    "krea-2-sdnq-int8/vae/config.json": "54949c79def0d1060353c3fbfd4d2d2c4815ae241da6d6d28c99634c4eac6e6e",
    "krea-2-sdnq-int8/vae/diffusion_pytorch_model.safetensors": "ab1b61103959913d6c7e628cf793dbb2ca4726a40a3b3ae206c52b8e75bf6f08",
    "nsfw-filter/config.json": "0e01783cf842a0acaa6b3b6594b941bee4d39a1918756b27d23f503878889696",
    "nsfw-filter/onnx/model.onnx": "a4316a4fb750169ac4fcabaabee1fcbd982b0ee8c0cc63fe3e944954bb9a7d9c",
    "nsfw-filter/preprocessor_config.json": "ae9bb157b9629887cc74913a4e7c12c9308f374f0930e8072320e8f2e1583c5e",
    "nsfw-filter/quantize_config.json": "9b60b5877b9a1687b5cddbc06124a974cb7536af9dbf5295279bf73c3823170c",
    # BG1's gate, completed at v1.58.0: every registry file pinned to the
    # SHA-256 of the file actually fetched and hashed, matching the table in
    # .docs/wiki/Licences.md. A download that does not match never lands.
    "rvm_mobilenetv3_fp32.onnx": "88d4531297118f595bf2fd60f6f566aec2e559393802d1f436c380f0cbbd2828",
    "isnet-general-use.onnx": "60920e99c45464f2ba57bee2ad08c919a52bbf852739e96947fbb4358c0d964a",
    "sam2_hiera_tiny.encoder.onnx": "4cc015ee18520e93f8c7ddfeaca7436039daaaaf19721b4b96a8810a805e82f7",
    "sam2_hiera_tiny.decoder.onnx": "f5a4bd656c143899fb7f52d64ed81e6f6aeb37d477a0b6da50146ac7cf2187bf",
    "sam21-video-vision_encoder.onnx": "aa7a8542942f042e235a993a1ab0ccf5f049918500577802a7f10ec1b39bb873",
    "sam21-video-mask_decoder.onnx": "0461896de3db00936fe1643506f129d71cb6d5d2ae15754811756b7ea1b070c6",
    "sam21-video-memory_encoder.onnx": "580d246c109de88838f600ba7c1c0d03d1fe267f7641b06f8c88c5f0dc5834cd",
    "sam21-video-memory_attention.onnx": "791e648ce8f5ef91ad00ba06e83066ff261ae5a645f0b042b4f46a89fd054baf",
    "sam21-video-pointer_tpos.onnx": "7e71df1d75dba09bc18dd4ae745c2a2cceebdd14d84eadea2fe65d0205f101fc",
    "sam21-video-constants.json": "172edc70e892aab0aef6caedf97b8e4091fbf6c5d26dac5fd9ea69d093d927d3",
    "u2netp.onnx": "309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8",
    "u2net_human_seg.onnx": "01eb6a29a5c4d8edb30b56adad9bb3a2a0535338e480724a213e0acfd2d1c73c",
    "lama_fp32.onnx": "1faef5301d78db7dda502fe59966957ec4b79dd64e16f03ed96913c7a4eb68d6",
    "depth-anything-v2-small/model.onnx": "afb6a5c28f3b6bf1618c6e43f02073ef9dfdc70e937502d51603e57b0a1df10c",
    "marigold-iid-lighting-v1-1/model_index.json": "f23f8eeb8fd4a6cd70cfc3d62dee4375d38dac0220e13ceff26f5f976c6f0d41",
    "marigold-iid-lighting-v1-1/scheduler/scheduler_config.json": "506414f187b3d1e96d8b3e121bca0e35158ece49b76b34d22dd756ca6332bd76",
    "marigold-iid-lighting-v1-1/text_encoder/config.json": "6b34b0bf6cff02e2afe88145740ef5e0316caf7add8307c8ec0b021a7923cc42",
    "marigold-iid-lighting-v1-1/text_encoder/model.fp16.safetensors": "bc1827c465450322616f06dea41596eac7d493f4e95904dcb51f0fc745c4e13f",
    "marigold-iid-lighting-v1-1/tokenizer/merges.txt": "9fd691f7c8039210e0fced15865466c65820d09b63988b0174bfe25de299051a",
    "marigold-iid-lighting-v1-1/tokenizer/special_tokens_map.json": "f118ab3a983206e4f32583448de6bd6aae4ee21869135cef1f5848a753cdaab6",
    "marigold-iid-lighting-v1-1/tokenizer/tokenizer_config.json": "516314ccab66918d7cb647480ac27abd3520d14e1e5825aac99f50c851c16071",
    "marigold-iid-lighting-v1-1/tokenizer/vocab.json": "e089ad92ba36837a0d31433e555c8f45fe601ab5c221d4f607ded32d9f7a4349",
    "marigold-iid-lighting-v1-1/unet/config.json": "9073c69ca6dd9868a6f013501bc7ae876ff97c8e4d48c5ce393029f61d95d6b7",
    "marigold-iid-lighting-v1-1/unet/diffusion_pytorch_model.fp16.safetensors": "8c2e8da73793181f87c9c7a752a939d6f6834104e9854bf1c53c6b37de3594d9",
    "marigold-iid-lighting-v1-1/vae/config.json": "52dbd493c4a9bd8d46867790f61f0bc4bc441d509ada5e07ce6c1c81c3c89da5",
    "marigold-iid-lighting-v1-1/vae/diffusion_pytorch_model.fp16.safetensors": "3e4c08995484ee61270175e9e7a072b66a6e4eeb5f0c266667fe1f45b90daf9a",
    "marigold-normals-v1-1/model_index.json": "2a9df1f02d91e9b8da08dea89768368dadb647d52f07e207f1f6fce88507877e",
    "marigold-normals-v1-1/scheduler/scheduler_config.json": "506414f187b3d1e96d8b3e121bca0e35158ece49b76b34d22dd756ca6332bd76",
    "marigold-normals-v1-1/text_encoder/config.json": "6b34b0bf6cff02e2afe88145740ef5e0316caf7add8307c8ec0b021a7923cc42",
    "marigold-normals-v1-1/text_encoder/model.fp16.safetensors": "bc1827c465450322616f06dea41596eac7d493f4e95904dcb51f0fc745c4e13f",
    "marigold-normals-v1-1/tokenizer/merges.txt": "9fd691f7c8039210e0fced15865466c65820d09b63988b0174bfe25de299051a",
    "marigold-normals-v1-1/tokenizer/special_tokens_map.json": "f118ab3a983206e4f32583448de6bd6aae4ee21869135cef1f5848a753cdaab6",
    "marigold-normals-v1-1/tokenizer/tokenizer_config.json": "516314ccab66918d7cb647480ac27abd3520d14e1e5825aac99f50c851c16071",
    "marigold-normals-v1-1/tokenizer/vocab.json": "e089ad92ba36837a0d31433e555c8f45fe601ab5c221d4f607ded32d9f7a4349",
    "marigold-normals-v1-1/unet/config.json": "33797898bbc3da990e861614bb8d132cd950f3fcfabcf2f95feb722a52598e8a",
    "marigold-normals-v1-1/unet/diffusion_pytorch_model.fp16.safetensors": "e90ff52ea6b56275a633cab0138ef8448fb5cffc9c1f283fb13520233b46d947",
    "marigold-normals-v1-1/vae/config.json": "52dbd493c4a9bd8d46867790f61f0bc4bc441d509ada5e07ce6c1c81c3c89da5",
    "marigold-normals-v1-1/vae/diffusion_pytorch_model.fp16.safetensors": "3e4c08995484ee61270175e9e7a072b66a6e4eeb5f0c266667fe1f45b90daf9a",
    "ddcolor-tiny/ddcolor-tiny-fp16.onnx": "2653da00dc15e54a45e5200b61dbf82ee9ceaf56b02bb9b9657569ac775e82e6",
    "fast-style/candy-9.onnx": "9d11a3529d1e547da6ae07201d93484dbab2ec0a3614535752c8f40f0fe2968a",
    "fast-style/mosaic-9.onnx": "fa646dedade881243f8d5a2ceb7de2b93675b21fc24f7482894ac4851a9a0a47",
    "fast-style/pointilism-9.onnx": "5ee2b8d4d6bc60a777f54e0fe96a1b717360a004b79d56c67390d4a975b14d98",
    "fast-style/rain-princess-9.onnx": "4162912e6f75fedef6f810ae989b9e10d3d5d43308dab34b027c850cf255e152",
    "fast-style/udnie-9.onnx": "8656b6ce7dec8f22ee13c2d557d6b67bd6f550dde88d0f2e7c9972aeb765cc0d",
    "yunet-face/face_detection_yunet_2023mar.onnx": "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4",
    "selfie-multiclass/model.onnx": "35ec1ecd9ee7f85073c99c00020b7f6751b69506eeacf683bc8665f6117f85b0",
    "moge-2-vits-normal/model.pt": "79a16621928c2bf0ed04659218c55c01075e950507f40bb3332fb4c873d3e1dc",
    "skyseg/skyseg.onnx": "ab9c34c64c3d821220a2886a4a06da4642ffa14d5b30e8d5339056a089aa1d39",
    "sam2.1-hiera-tiny/vision_encoder.onnx": "4f30aacd3aaefbca81a0b7fe4c1fc96345570ea0a6f80ced599493d1b3be2e8c",
    "sam2.1-hiera-tiny/vision_encoder.onnx_data": "e83df9866a5afe68ea7f0f721f18f65137fc3acbf0da1c74e946d363e09c69cc",
    "sam2.1-hiera-tiny/prompt_encoder_mask_decoder.onnx": "874414704c5d686db7d206a35f6e15d26563d50c8c4468fccc6739bd7e491dcf",
    "sam2.1-hiera-tiny/prompt_encoder_mask_decoder.onnx_data": "e9874d900dd4134ed60eab1e97910327c2419e0b2954485d8fd6e7f1a1470f47",
    "u2net.onnx": "8d10d2f3bb75ae3b6d527c77944fc5e7dcd94b29809d47a739a7a728a912b491",
    "realesrgan-x4plus.onnx": "4851ec156207d271f5328605d0582eeb851e656227da8aca093ced9e60789291",
    "kokoro-v1.0.onnx": "beb0d1848dee9a49da392cc3df26958d46cfa35d321edf434f52949153f0df3a",
    "voices-v1.0.bin": "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d",
    "flux2-klein-4b-mlx-q8/text_encoder/0.safetensors": "c59037293e62b9142e06e602a03b734fdf7f0f6b80141759f875200bab5ff523",
    "flux2-klein-4b-mlx-q8/text_encoder/1.safetensors": "ccb1fd9fa0e19db71c44b3fdd9ed16e15dc14de3dcd240a0b162c4a10faba2cc",
    "flux2-klein-4b-mlx-q8/text_encoder/model.safetensors.index.json": "3273ab420ba8b5bfd991cc233b8d90afa794ffe856925299c892ee4c9d1614f2",
    "flux2-klein-4b-mlx-q8/tokenizer/chat_template.jinja": "a55ee1b1660128b7098723e0abcd92caa0788061051c62d51cbe87d9cf1974d8",
    "flux2-klein-4b-mlx-q8/tokenizer/tokenizer.json": "be75606093db2094d7cd20f3c2f385c212750648bd6ea4fb2bf507a6a4c55506",
    "flux2-klein-4b-mlx-q8/tokenizer/tokenizer_config.json": "779410a34a98fb2c6c925a1be6f24d632f1723473161b037f6676eb6c04886c6",
    "flux2-klein-4b-mlx-q8/transformer/0.safetensors": "442cb6770b834cb47043ef96f929b05b21e84bb1cca6daa806bf416aaa0b04f9",
    "flux2-klein-4b-mlx-q8/transformer/1.safetensors": "5cbf48740f8655185b3578a25188d2db72148ea2476385979961d89ee56d0dcc",
    "flux2-klein-4b-mlx-q8/transformer/model.safetensors.index.json": "fce32043337212c1fb02f5da46b0dde35cfecdb577d618e46bab6ce70392468f",
    "flux2-klein-4b-mlx-q8/vae/0.safetensors": "fc2ff418c22e76c8ad93c43b4ffdee19d10a90898d3d10ef3c53dda9ad9cb4f2",
    "flux2-klein-4b-mlx-q8/vae/model.safetensors.index.json": "ae30aec3a3da440b700726376c89d1574cb4182e4ca534809243606df4d3be38",
    "flux2-klein-4b-mlx-q4/text_encoder/0.safetensors": "e59ed2b6825cb8ae3d0ba1e8a43575a565d465ce4518b7d79d28020b19b639cd",
    "flux2-klein-4b-mlx-q4/text_encoder/1.safetensors": "edbdea3187bc4a0ad0e1ecb7152da8e6b344669413d9e45be5e7a2244f398ee3",
    "flux2-klein-4b-mlx-q4/text_encoder/model.safetensors.index.json": "7dc8598806b8bbdb0b87b9dc445ac7cf49d7acc42ae333bd0bc0252e46081ed9",
    "flux2-klein-4b-mlx-q4/tokenizer/chat_template.jinja": "a55ee1b1660128b7098723e0abcd92caa0788061051c62d51cbe87d9cf1974d8",
    "flux2-klein-4b-mlx-q4/tokenizer/tokenizer.json": "be75606093db2094d7cd20f3c2f385c212750648bd6ea4fb2bf507a6a4c55506",
    "flux2-klein-4b-mlx-q4/tokenizer/tokenizer_config.json": "779410a34a98fb2c6c925a1be6f24d632f1723473161b037f6676eb6c04886c6",
    "flux2-klein-4b-mlx-q4/transformer/0.safetensors": "36796395e3946496f3e118f26fe22594b1d7d871342a59dd7824349d91c08266",
    "flux2-klein-4b-mlx-q4/transformer/1.safetensors": "9730ae148ca4f5ffc62860748b849a70987f0b7301588248bd98a2af9bc15070",
    "flux2-klein-4b-mlx-q4/transformer/model.safetensors.index.json": "dbdecbf3a957b37d15bd943b956dbb25aa648a01df363e7dd5ebbe5ce941358d",
    "flux2-klein-4b-mlx-q4/vae/0.safetensors": "688ae0c3d2e93573ce8a6d3561d793cf6de5a4207b2e128cad6cd0d71e43b10f",
    "flux2-klein-4b-mlx-q4/vae/model.safetensors.index.json": "e13e551dabf8c088c8b3c6f52fca3f9e64ead5c42dd592586c7a1f868607afa4",
}


_lock = threading.RLock()

_downloading: set[str] = set()


MODELS = {
    "krea-2-mlx-q8": {
        "name": "Krea 2 Turbo, 8-bit MLX (mflux-community)",
        "license": "Krea 2 Community License Agreement",
        "optional": True,
        "consent": "krea-2",
        "maxFileBytes": 2241144740,
        # mflux-community/krea-2-turbo-mflux-q8 at 5f94d7734c8873daddf803721f6423148619f63c, 19 files, 22.19 GB
        "files": {
            "krea-2-mlx-q8/.DS_Store": "https://huggingface.co/mflux-community/krea-2-turbo-mflux-q8/resolve/5f94d7734c8873daddf803721f6423148619f63c/.DS_Store",
            "krea-2-mlx-q8/0.safetensors": "https://huggingface.co/mflux-community/krea-2-turbo-mflux-q8/resolve/5f94d7734c8873daddf803721f6423148619f63c/0.safetensors",
            "krea-2-mlx-q8/1.safetensors": "https://huggingface.co/mflux-community/krea-2-turbo-mflux-q8/resolve/5f94d7734c8873daddf803721f6423148619f63c/1.safetensors",
            "krea-2-mlx-q8/2.safetensors": "https://huggingface.co/mflux-community/krea-2-turbo-mflux-q8/resolve/5f94d7734c8873daddf803721f6423148619f63c/2.safetensors",
            "krea-2-mlx-q8/3.safetensors": "https://huggingface.co/mflux-community/krea-2-turbo-mflux-q8/resolve/5f94d7734c8873daddf803721f6423148619f63c/3.safetensors",
            "krea-2-mlx-q8/4.safetensors": "https://huggingface.co/mflux-community/krea-2-turbo-mflux-q8/resolve/5f94d7734c8873daddf803721f6423148619f63c/4.safetensors",
            "krea-2-mlx-q8/5.safetensors": "https://huggingface.co/mflux-community/krea-2-turbo-mflux-q8/resolve/5f94d7734c8873daddf803721f6423148619f63c/5.safetensors",
            "krea-2-mlx-q8/6.safetensors": "https://huggingface.co/mflux-community/krea-2-turbo-mflux-q8/resolve/5f94d7734c8873daddf803721f6423148619f63c/6.safetensors",
            "krea-2-mlx-q8/model.safetensors.index.json": "https://huggingface.co/mflux-community/krea-2-turbo-mflux-q8/resolve/5f94d7734c8873daddf803721f6423148619f63c/model.safetensors.index.json",
            "krea-2-mlx-q8/text_encoder/0.safetensors": "https://huggingface.co/mflux-community/krea-2-turbo-mflux-q8/resolve/5f94d7734c8873daddf803721f6423148619f63c/text_encoder/0.safetensors",
            "krea-2-mlx-q8/text_encoder/1.safetensors": "https://huggingface.co/mflux-community/krea-2-turbo-mflux-q8/resolve/5f94d7734c8873daddf803721f6423148619f63c/text_encoder/1.safetensors",
            "krea-2-mlx-q8/text_encoder/2.safetensors": "https://huggingface.co/mflux-community/krea-2-turbo-mflux-q8/resolve/5f94d7734c8873daddf803721f6423148619f63c/text_encoder/2.safetensors",
            "krea-2-mlx-q8/text_encoder/3.safetensors": "https://huggingface.co/mflux-community/krea-2-turbo-mflux-q8/resolve/5f94d7734c8873daddf803721f6423148619f63c/text_encoder/3.safetensors",
            "krea-2-mlx-q8/text_encoder/model.safetensors.index.json": "https://huggingface.co/mflux-community/krea-2-turbo-mflux-q8/resolve/5f94d7734c8873daddf803721f6423148619f63c/text_encoder/model.safetensors.index.json",
            "krea-2-mlx-q8/tokenizer/chat_template.jinja": "https://huggingface.co/mflux-community/krea-2-turbo-mflux-q8/resolve/5f94d7734c8873daddf803721f6423148619f63c/tokenizer/chat_template.jinja",
            "krea-2-mlx-q8/tokenizer/tokenizer.json": "https://huggingface.co/mflux-community/krea-2-turbo-mflux-q8/resolve/5f94d7734c8873daddf803721f6423148619f63c/tokenizer/tokenizer.json",
            "krea-2-mlx-q8/tokenizer/tokenizer_config.json": "https://huggingface.co/mflux-community/krea-2-turbo-mflux-q8/resolve/5f94d7734c8873daddf803721f6423148619f63c/tokenizer/tokenizer_config.json",
            "krea-2-mlx-q8/vae/0.safetensors": "https://huggingface.co/mflux-community/krea-2-turbo-mflux-q8/resolve/5f94d7734c8873daddf803721f6423148619f63c/vae/0.safetensors",
            "krea-2-mlx-q8/vae/model.safetensors.index.json": "https://huggingface.co/mflux-community/krea-2-turbo-mflux-q8/resolve/5f94d7734c8873daddf803721f6423148619f63c/vae/model.safetensors.index.json",
        },
    },
    "krea-2-mlx-q4": {
        "name": "Krea 2 Turbo, 4-bit MLX (mflux-community)",
        "license": "Krea 2 Community License Agreement",
        "optional": True,
        "consent": "krea-2",
        "maxFileBytes": 2242209936,
        # mflux-community/krea-2-turbo-mflux-q4 at fa0ba74dc2e50c4288a81216e05487c343196bf7, 16 files, 15.78 GB
        "files": {
            "krea-2-mlx-q4/.DS_Store": "https://huggingface.co/mflux-community/krea-2-turbo-mflux-q4/resolve/fa0ba74dc2e50c4288a81216e05487c343196bf7/.DS_Store",
            "krea-2-mlx-q4/0.safetensors": "https://huggingface.co/mflux-community/krea-2-turbo-mflux-q4/resolve/fa0ba74dc2e50c4288a81216e05487c343196bf7/0.safetensors",
            "krea-2-mlx-q4/1.safetensors": "https://huggingface.co/mflux-community/krea-2-turbo-mflux-q4/resolve/fa0ba74dc2e50c4288a81216e05487c343196bf7/1.safetensors",
            "krea-2-mlx-q4/2.safetensors": "https://huggingface.co/mflux-community/krea-2-turbo-mflux-q4/resolve/fa0ba74dc2e50c4288a81216e05487c343196bf7/2.safetensors",
            "krea-2-mlx-q4/3.safetensors": "https://huggingface.co/mflux-community/krea-2-turbo-mflux-q4/resolve/fa0ba74dc2e50c4288a81216e05487c343196bf7/3.safetensors",
            "krea-2-mlx-q4/model.safetensors.index.json": "https://huggingface.co/mflux-community/krea-2-turbo-mflux-q4/resolve/fa0ba74dc2e50c4288a81216e05487c343196bf7/model.safetensors.index.json",
            "krea-2-mlx-q4/text_encoder/0.safetensors": "https://huggingface.co/mflux-community/krea-2-turbo-mflux-q4/resolve/fa0ba74dc2e50c4288a81216e05487c343196bf7/text_encoder/0.safetensors",
            "krea-2-mlx-q4/text_encoder/1.safetensors": "https://huggingface.co/mflux-community/krea-2-turbo-mflux-q4/resolve/fa0ba74dc2e50c4288a81216e05487c343196bf7/text_encoder/1.safetensors",
            "krea-2-mlx-q4/text_encoder/2.safetensors": "https://huggingface.co/mflux-community/krea-2-turbo-mflux-q4/resolve/fa0ba74dc2e50c4288a81216e05487c343196bf7/text_encoder/2.safetensors",
            "krea-2-mlx-q4/text_encoder/3.safetensors": "https://huggingface.co/mflux-community/krea-2-turbo-mflux-q4/resolve/fa0ba74dc2e50c4288a81216e05487c343196bf7/text_encoder/3.safetensors",
            "krea-2-mlx-q4/text_encoder/model.safetensors.index.json": "https://huggingface.co/mflux-community/krea-2-turbo-mflux-q4/resolve/fa0ba74dc2e50c4288a81216e05487c343196bf7/text_encoder/model.safetensors.index.json",
            "krea-2-mlx-q4/tokenizer/chat_template.jinja": "https://huggingface.co/mflux-community/krea-2-turbo-mflux-q4/resolve/fa0ba74dc2e50c4288a81216e05487c343196bf7/tokenizer/chat_template.jinja",
            "krea-2-mlx-q4/tokenizer/tokenizer.json": "https://huggingface.co/mflux-community/krea-2-turbo-mflux-q4/resolve/fa0ba74dc2e50c4288a81216e05487c343196bf7/tokenizer/tokenizer.json",
            "krea-2-mlx-q4/tokenizer/tokenizer_config.json": "https://huggingface.co/mflux-community/krea-2-turbo-mflux-q4/resolve/fa0ba74dc2e50c4288a81216e05487c343196bf7/tokenizer/tokenizer_config.json",
            "krea-2-mlx-q4/vae/0.safetensors": "https://huggingface.co/mflux-community/krea-2-turbo-mflux-q4/resolve/fa0ba74dc2e50c4288a81216e05487c343196bf7/vae/0.safetensors",
            "krea-2-mlx-q4/vae/model.safetensors.index.json": "https://huggingface.co/mflux-community/krea-2-turbo-mflux-q4/resolve/fa0ba74dc2e50c4288a81216e05487c343196bf7/vae/model.safetensors.index.json",
        },
    },
    "krea-2-sdnq-int8": {
        "name": "Krea 2 Turbo, 8-bit SDNQ (diffusers)",
        "license": "Krea 2 Community License Agreement",
        "optional": True,
        "consent": "krea-2",
        "maxFileBytes": 10088722566,
        # OzzyGT/Krea_2_Turbo_sdnq_dynamic_8bit at dfa31958258de845f21a86e0dd0566f46d3a7970, 14 files, 18.30 GB
        "files": {
            "krea-2-sdnq-int8/LICENSE.pdf": "https://huggingface.co/OzzyGT/Krea_2_Turbo_sdnq_dynamic_8bit/resolve/dfa31958258de845f21a86e0dd0566f46d3a7970/LICENSE.pdf",
            "krea-2-sdnq-int8/model_index.json": "https://huggingface.co/OzzyGT/Krea_2_Turbo_sdnq_dynamic_8bit/resolve/dfa31958258de845f21a86e0dd0566f46d3a7970/model_index.json",
            "krea-2-sdnq-int8/scheduler/scheduler_config.json": "https://huggingface.co/OzzyGT/Krea_2_Turbo_sdnq_dynamic_8bit/resolve/dfa31958258de845f21a86e0dd0566f46d3a7970/scheduler/scheduler_config.json",
            "krea-2-sdnq-int8/text_encoder/config.json": "https://huggingface.co/OzzyGT/Krea_2_Turbo_sdnq_dynamic_8bit/resolve/dfa31958258de845f21a86e0dd0566f46d3a7970/text_encoder/config.json",
            "krea-2-sdnq-int8/text_encoder/model.safetensors": "https://huggingface.co/OzzyGT/Krea_2_Turbo_sdnq_dynamic_8bit/resolve/dfa31958258de845f21a86e0dd0566f46d3a7970/text_encoder/model.safetensors",
            "krea-2-sdnq-int8/tokenizer/chat_template.jinja": "https://huggingface.co/OzzyGT/Krea_2_Turbo_sdnq_dynamic_8bit/resolve/dfa31958258de845f21a86e0dd0566f46d3a7970/tokenizer/chat_template.jinja",
            "krea-2-sdnq-int8/tokenizer/tokenizer.json": "https://huggingface.co/OzzyGT/Krea_2_Turbo_sdnq_dynamic_8bit/resolve/dfa31958258de845f21a86e0dd0566f46d3a7970/tokenizer/tokenizer.json",
            "krea-2-sdnq-int8/tokenizer/tokenizer_config.json": "https://huggingface.co/OzzyGT/Krea_2_Turbo_sdnq_dynamic_8bit/resolve/dfa31958258de845f21a86e0dd0566f46d3a7970/tokenizer/tokenizer_config.json",
            "krea-2-sdnq-int8/transformer/config.json": "https://huggingface.co/OzzyGT/Krea_2_Turbo_sdnq_dynamic_8bit/resolve/dfa31958258de845f21a86e0dd0566f46d3a7970/transformer/config.json",
            "krea-2-sdnq-int8/transformer/diffusion_pytorch_model-00001-of-00002.safetensors": "https://huggingface.co/OzzyGT/Krea_2_Turbo_sdnq_dynamic_8bit/resolve/dfa31958258de845f21a86e0dd0566f46d3a7970/transformer/diffusion_pytorch_model-00001-of-00002.safetensors",
            "krea-2-sdnq-int8/transformer/diffusion_pytorch_model-00002-of-00002.safetensors": "https://huggingface.co/OzzyGT/Krea_2_Turbo_sdnq_dynamic_8bit/resolve/dfa31958258de845f21a86e0dd0566f46d3a7970/transformer/diffusion_pytorch_model-00002-of-00002.safetensors",
            "krea-2-sdnq-int8/transformer/diffusion_pytorch_model.safetensors.index.json": "https://huggingface.co/OzzyGT/Krea_2_Turbo_sdnq_dynamic_8bit/resolve/dfa31958258de845f21a86e0dd0566f46d3a7970/transformer/diffusion_pytorch_model.safetensors.index.json",
            "krea-2-sdnq-int8/vae/config.json": "https://huggingface.co/OzzyGT/Krea_2_Turbo_sdnq_dynamic_8bit/resolve/dfa31958258de845f21a86e0dd0566f46d3a7970/vae/config.json",
            "krea-2-sdnq-int8/vae/diffusion_pytorch_model.safetensors": "https://huggingface.co/OzzyGT/Krea_2_Turbo_sdnq_dynamic_8bit/resolve/dfa31958258de845f21a86e0dd0566f46d3a7970/vae/diffusion_pytorch_model.safetensors",
        },
    },
    "flux2-klein-4b-mlx-q8": {
        "name": "FLUX.2 [klein] 4B, 8-bit MLX (mflux-community)",
        "license": "Apache-2.0",
        "optional": True,
        "consent": "klein-4b",
        "maxFileBytes": 2145931486,
        # mflux-community/flux2-klein-4b-mflux-q8 at ca49409e4ce21c6717ee87caadd9488e0b15208f, 11 files, 8.57 GB
        "files": {
            "flux2-klein-4b-mlx-q8/text_encoder/0.safetensors": "https://huggingface.co/mflux-community/flux2-klein-4b-mflux-q8/resolve/ca49409e4ce21c6717ee87caadd9488e0b15208f/text_encoder/0.safetensors",
            "flux2-klein-4b-mlx-q8/text_encoder/1.safetensors": "https://huggingface.co/mflux-community/flux2-klein-4b-mflux-q8/resolve/ca49409e4ce21c6717ee87caadd9488e0b15208f/text_encoder/1.safetensors",
            "flux2-klein-4b-mlx-q8/text_encoder/model.safetensors.index.json": "https://huggingface.co/mflux-community/flux2-klein-4b-mflux-q8/resolve/ca49409e4ce21c6717ee87caadd9488e0b15208f/text_encoder/model.safetensors.index.json",
            "flux2-klein-4b-mlx-q8/tokenizer/chat_template.jinja": "https://huggingface.co/mflux-community/flux2-klein-4b-mflux-q8/resolve/ca49409e4ce21c6717ee87caadd9488e0b15208f/tokenizer/chat_template.jinja",
            "flux2-klein-4b-mlx-q8/tokenizer/tokenizer.json": "https://huggingface.co/mflux-community/flux2-klein-4b-mflux-q8/resolve/ca49409e4ce21c6717ee87caadd9488e0b15208f/tokenizer/tokenizer.json",
            "flux2-klein-4b-mlx-q8/tokenizer/tokenizer_config.json": "https://huggingface.co/mflux-community/flux2-klein-4b-mflux-q8/resolve/ca49409e4ce21c6717ee87caadd9488e0b15208f/tokenizer/tokenizer_config.json",
            "flux2-klein-4b-mlx-q8/transformer/0.safetensors": "https://huggingface.co/mflux-community/flux2-klein-4b-mflux-q8/resolve/ca49409e4ce21c6717ee87caadd9488e0b15208f/transformer/0.safetensors",
            "flux2-klein-4b-mlx-q8/transformer/1.safetensors": "https://huggingface.co/mflux-community/flux2-klein-4b-mflux-q8/resolve/ca49409e4ce21c6717ee87caadd9488e0b15208f/transformer/1.safetensors",
            "flux2-klein-4b-mlx-q8/transformer/model.safetensors.index.json": "https://huggingface.co/mflux-community/flux2-klein-4b-mflux-q8/resolve/ca49409e4ce21c6717ee87caadd9488e0b15208f/transformer/model.safetensors.index.json",
            "flux2-klein-4b-mlx-q8/vae/0.safetensors": "https://huggingface.co/mflux-community/flux2-klein-4b-mflux-q8/resolve/ca49409e4ce21c6717ee87caadd9488e0b15208f/vae/0.safetensors",
            "flux2-klein-4b-mlx-q8/vae/model.safetensors.index.json": "https://huggingface.co/mflux-community/flux2-klein-4b-mflux-q8/resolve/ca49409e4ce21c6717ee87caadd9488e0b15208f/vae/model.safetensors.index.json",
        },
    },
    "flux2-klein-4b-mlx-q4": {
        "name": "FLUX.2 [klein] 4B, 4-bit MLX (mflux-community)",
        "license": "Apache-2.0",
        "optional": True,
        "consent": "klein-4b",
        "maxFileBytes": 2145323770,
        # mflux-community/flux2-klein-4b-mflux-q4 at 794cd159538149ad9830848508c31f0ea7088e58, 11 files, 4.62 GB
        "files": {
            "flux2-klein-4b-mlx-q4/text_encoder/0.safetensors": "https://huggingface.co/mflux-community/flux2-klein-4b-mflux-q4/resolve/794cd159538149ad9830848508c31f0ea7088e58/text_encoder/0.safetensors",
            "flux2-klein-4b-mlx-q4/text_encoder/1.safetensors": "https://huggingface.co/mflux-community/flux2-klein-4b-mflux-q4/resolve/794cd159538149ad9830848508c31f0ea7088e58/text_encoder/1.safetensors",
            "flux2-klein-4b-mlx-q4/text_encoder/model.safetensors.index.json": "https://huggingface.co/mflux-community/flux2-klein-4b-mflux-q4/resolve/794cd159538149ad9830848508c31f0ea7088e58/text_encoder/model.safetensors.index.json",
            "flux2-klein-4b-mlx-q4/tokenizer/chat_template.jinja": "https://huggingface.co/mflux-community/flux2-klein-4b-mflux-q4/resolve/794cd159538149ad9830848508c31f0ea7088e58/tokenizer/chat_template.jinja",
            "flux2-klein-4b-mlx-q4/tokenizer/tokenizer.json": "https://huggingface.co/mflux-community/flux2-klein-4b-mflux-q4/resolve/794cd159538149ad9830848508c31f0ea7088e58/tokenizer/tokenizer.json",
            "flux2-klein-4b-mlx-q4/tokenizer/tokenizer_config.json": "https://huggingface.co/mflux-community/flux2-klein-4b-mflux-q4/resolve/794cd159538149ad9830848508c31f0ea7088e58/tokenizer/tokenizer_config.json",
            "flux2-klein-4b-mlx-q4/transformer/0.safetensors": "https://huggingface.co/mflux-community/flux2-klein-4b-mflux-q4/resolve/794cd159538149ad9830848508c31f0ea7088e58/transformer/0.safetensors",
            "flux2-klein-4b-mlx-q4/transformer/1.safetensors": "https://huggingface.co/mflux-community/flux2-klein-4b-mflux-q4/resolve/794cd159538149ad9830848508c31f0ea7088e58/transformer/1.safetensors",
            "flux2-klein-4b-mlx-q4/transformer/model.safetensors.index.json": "https://huggingface.co/mflux-community/flux2-klein-4b-mflux-q4/resolve/794cd159538149ad9830848508c31f0ea7088e58/transformer/model.safetensors.index.json",
            "flux2-klein-4b-mlx-q4/vae/0.safetensors": "https://huggingface.co/mflux-community/flux2-klein-4b-mflux-q4/resolve/794cd159538149ad9830848508c31f0ea7088e58/vae/0.safetensors",
            "flux2-klein-4b-mlx-q4/vae/model.safetensors.index.json": "https://huggingface.co/mflux-community/flux2-klein-4b-mflux-q4/resolve/794cd159538149ad9830848508c31f0ea7088e58/vae/model.safetensors.index.json",
        },
    },
    "nsfw-filter": {
        "name": "Falconsai/nsfw_image_detection (ONNX), the content filter for Krea 2",
        "license": "Apache-2.0",
        "optional": True,
        "maxFileBytes": 2000000000,
        # onnx-community/nsfw_image_detection-ONNX at 1ceb3c7fe1e9f3f2507e6df577437f23a9149fd5, 4 files, 0.34 GB
        "files": {
            "nsfw-filter/config.json": "https://huggingface.co/onnx-community/nsfw_image_detection-ONNX/resolve/1ceb3c7fe1e9f3f2507e6df577437f23a9149fd5/config.json",
            "nsfw-filter/onnx/model.onnx": "https://huggingface.co/onnx-community/nsfw_image_detection-ONNX/resolve/1ceb3c7fe1e9f3f2507e6df577437f23a9149fd5/onnx/model.onnx",
            "nsfw-filter/preprocessor_config.json": "https://huggingface.co/onnx-community/nsfw_image_detection-ONNX/resolve/1ceb3c7fe1e9f3f2507e6df577437f23a9149fd5/preprocessor_config.json",
            "nsfw-filter/quantize_config.json": "https://huggingface.co/onnx-community/nsfw_image_detection-ONNX/resolve/1ceb3c7fe1e9f3f2507e6df577437f23a9149fd5/quantize_config.json",
        },
    },
    # LaMa (1.53.2, formvis): inpainting on any computer's CPU, for Generative Fill and Expand without a prompt,
    # ComfyUI or fal. big-lama exported to ONNX by Carve (Apache-2.0), fixed at 512 x 512, pinned to its revision.
    "lama-inpaint": {
        "name": "LaMa inpainting (big-lama, ONNX)",
        "license": "Apache-2.0",
        "files": {"lama_fp32.onnx": "https://huggingface.co/Carve/LaMa-ONNX/resolve/c3c0c9e468934d62e79c329e35d82dd09ff8c444/lama_fp32.onnx"},
    },
    # Depth Anything V2 Small as ONNX (1.54.8, formvis): depth from one picture for the Neural Filters' Depth Blur. The
    # Small checkpoint is Apache-2.0 (Base, Large and Giant are CC-BY-NC and are not used); onnx-community's export,
    # pinned to its revision, hashed on 1 October 2026.
    "depth-anything-v2-small": {
        "name": "Depth Anything V2 Small (ONNX)",
        "license": "Apache-2.0",
        "files": {"depth-anything-v2-small/model.onnx": "https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/413ce838e669ab7dfc01a6a396bf3d4397286d7f/onnx/model.onnx"},
    },
    "marigold-iid-lighting": {
        "name": "Marigold IID Lighting v1.1 (albedo and shading, fp16)",
        "license": "CreativeML Open RAIL++-M",
        "optional": True,
        "files": {name: f"https://huggingface.co/prs-eth/marigold-iid-lighting-v1-1/resolve/08c3930bb641abf786ba44ce92547507ebefbc16/{name.split('/', 1)[1]}"
                  for name in ("marigold-iid-lighting-v1-1/model_index.json", "marigold-iid-lighting-v1-1/scheduler/scheduler_config.json",
                               "marigold-iid-lighting-v1-1/text_encoder/config.json", "marigold-iid-lighting-v1-1/text_encoder/model.fp16.safetensors",
                               "marigold-iid-lighting-v1-1/tokenizer/merges.txt", "marigold-iid-lighting-v1-1/tokenizer/special_tokens_map.json",
                               "marigold-iid-lighting-v1-1/tokenizer/tokenizer_config.json", "marigold-iid-lighting-v1-1/tokenizer/vocab.json",
                               "marigold-iid-lighting-v1-1/unet/config.json", "marigold-iid-lighting-v1-1/unet/diffusion_pytorch_model.fp16.safetensors",
                               "marigold-iid-lighting-v1-1/vae/config.json", "marigold-iid-lighting-v1-1/vae/diffusion_pytorch_model.fp16.safetensors")},
    },
    "marigold-normals": {
        "name": "Marigold Normals v1.1 (surface normals, fp16)",
        "license": "CreativeML Open RAIL++-M",
        "optional": True,
        "files": {name: f"https://huggingface.co/prs-eth/marigold-normals-v1-1/resolve/09cfdd258cb281fa006cf1afcd2284376d16687d/{name.split('/', 1)[1]}"
                  for name in ("marigold-normals-v1-1/model_index.json", "marigold-normals-v1-1/scheduler/scheduler_config.json",
                               "marigold-normals-v1-1/text_encoder/config.json", "marigold-normals-v1-1/text_encoder/model.fp16.safetensors",
                               "marigold-normals-v1-1/tokenizer/merges.txt", "marigold-normals-v1-1/tokenizer/special_tokens_map.json",
                               "marigold-normals-v1-1/tokenizer/tokenizer_config.json", "marigold-normals-v1-1/tokenizer/vocab.json",
                               "marigold-normals-v1-1/unet/config.json", "marigold-normals-v1-1/unet/diffusion_pytorch_model.fp16.safetensors",
                               "marigold-normals-v1-1/vae/config.json", "marigold-normals-v1-1/vae/diffusion_pytorch_model.fp16.safetensors")},
    },
    # MoGe-2 small with normals (1.82.0): Microsoft's monocular geometry model, MIT (model card and repository), depth,
    # normals and a camera in one pass; Relight's scene uses its normals. Pinned to its revision, hashed on 18 October
    # 2026 from the real download; runs with backend/requirements_relight.txt.
    "moge-2-vits-normal": {
        "name": "MoGe-2 small (depth and normals, Microsoft)",
        "license": "MIT",
        "optional": True,
        "files": {"moge-2-vits-normal/model.pt": "https://huggingface.co/Ruicheng/moge-2-vits-normal/resolve/26b477f41595707c5db6770294c0d1721e8ed4ed/model.pt"},
    },
    # DDColor-tiny as ONNX (1.54.9, formvis): colour for black-and-white pictures in the Neural Filters. DDColor is
    # Apache-2.0 (piddnad/DDColor); the fp16 export is edgetools', pinned to its revision, hashed on 1 October 2026.
    "ddcolor-tiny": {
        "name": "DDColor-tiny (ONNX)",
        "license": "Apache-2.0",
        "files": {"ddcolor-tiny/ddcolor-tiny-fp16.onnx": "https://huggingface.co/edgetools/ddcolor/resolve/4755ae9f1f7a35a9e7693b96c2a88f3432cb6ab0/ddcolor-tiny-fp16.onnx"},
    },
    # The ONNX model zoo's fast neural style presets (1.55.1, formvis): five styles for the Neural Filters' Style
    # Transfer. The zoo's files are BSD-3-Clause; each file is pinned by SHA-256 below, hashed on 1 October 2026.
    "fast-style": {
        "name": "Style Transfer presets (fast neural style, ONNX)",
        "license": "BSD-3-Clause",
        "files": {f"fast-style/{s}-9.onnx": f"https://github.com/onnx/models/raw/main/validated/vision/style_transfer/fast_neural_style/model/{s}-9.onnx" for s in ("candy", "mosaic", "rain-princess", "udnie", "pointilism")},
    },
    # YuNet (1.56.7, formvis): OpenCV Zoo's face detector, MIT (Shiqi Yu), for Face-Aware Liquify; OpenCV's Hugging Face
    # copy pinned to its revision, hashed on 1 October 2026; OpenCV's own FaceDetectorYN runs it.
    "yunet-face": {
        "name": "YuNet face detector (OpenCV Zoo)",
        "license": "MIT",
        "files": {"yunet-face/face_detection_yunet_2023mar.onnx": "https://huggingface.co/opencv/face_detection_yunet/resolve/3cc26e7f1014a5ee5d74a42acee58bafc9d0a310/face_detection_yunet_2023mar.onnx"},
    },
    # MediaPipe selfie multiclass (1.76.0, from formlit 0.45.3's parts masks): background, hair, body skin, face skin,
    # clothes and accessories as soft maps, Apache-2.0 (Google), a 16 MB ONNX export pinned to its revision; hashed on
    # 18 October 2026 from the real download, matching formlit's pin. Relight shades each material on its own.
    "selfie-multiclass": {
        "name": "Selfie multiclass (hair, skin, clothes; MediaPipe)",
        "license": "Apache-2.0",
        "files": {"selfie-multiclass/model.onnx": "https://huggingface.co/senty-au/selfie_multiclass_256x256-ONNX/resolve/6db8421a7150ac20558f2c24675078eb3a1a04d0/onnx/model.onnx"},
    },
    # The sky segmenter (1.57.6, formvis): xiongzhu666's U-2-Net sky model, MIT (2021), from the Hugging Face copy the
    # VGGT project uses, pinned to its revision; hashed on 1 October 2026 from the real download; for Select > Sky.
    "skyseg": {
        "name": "Sky segmenter (U-2-Net)",
        "license": "MIT",
        "files": {"skyseg/skyseg.onnx": "https://huggingface.co/JianyuanWang/skyseg/resolve/3ba8c6df1d9ba9ff26f637c7ba9568ac11a9aa7f/skyseg.onnx"},
    },
    # SAM 2.1 tiny as ONNX (1.53.4, formvis): Object Selection with nothing to install, on ONNX Runtime. Meta's SAM 2.1
    # weights (Apache-2.0), exported by onnx-community (the export states no licence of its own), pinned to its revision.
    "sam2-onnx": {
        "name": "SAM 2.1 tiny (ONNX)",
        "license": "Apache-2.0",
        "files": {
            "sam2.1-hiera-tiny/vision_encoder.onnx": "https://huggingface.co/onnx-community/sam2.1-hiera-tiny-ONNX/resolve/814a066640debee5a91e70aa401fb8e17e030503/onnx/vision_encoder.onnx",
            "sam2.1-hiera-tiny/vision_encoder.onnx_data": "https://huggingface.co/onnx-community/sam2.1-hiera-tiny-ONNX/resolve/814a066640debee5a91e70aa401fb8e17e030503/onnx/vision_encoder.onnx_data",
            "sam2.1-hiera-tiny/prompt_encoder_mask_decoder.onnx": "https://huggingface.co/onnx-community/sam2.1-hiera-tiny-ONNX/resolve/814a066640debee5a91e70aa401fb8e17e030503/onnx/prompt_encoder_mask_decoder.onnx",
            "sam2.1-hiera-tiny/prompt_encoder_mask_decoder.onnx_data": "https://huggingface.co/onnx-community/sam2.1-hiera-tiny-ONNX/resolve/814a066640debee5a91e70aa401fb8e17e030503/onnx/prompt_encoder_mask_decoder.onnx_data",
        },
    },
    # U^2-Net (1.53.4, formvis): Select Subject and Remove Background with nothing to install, the same model rembg uses
    # (its md5 checked against rembg's), run on ONNX Runtime; Apache-2.0.
    "u2net-onnx": {
        "name": "U2-Net (background and subject)",
        "license": "Apache-2.0",
        "files": {"u2net.onnx": "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2net.onnx"},
    },
    "ai-upscale": {
        "name": "Real-ESRGAN x4plus",
        "license": "BSD-3-Clause",
        # Converted to ONNX from the official RealESRGAN_x4plus.pth by a published,
        # reproducible recipe; pinned below to the converter's stated SHA-256.
        "files": {"realesrgan-x4plus.onnx": "https://huggingface.co/skillsafe-ai/realesrgan-x4plus/resolve/main/model.onnx"},
    },
}

SOURCES_FILE = ROOT / "sources.json"


def ready(model: str) -> bool:
    """Every file of the model is there: weights past the one-kilobyte floor, a config or licence file merely non-empty."""
    if model not in MODELS:
        return False
    for name in MODELS[model]["files"]:
        path = model_file(name)
        if not path.is_file():
            return False
        floor = 1024 if path.suffix in (".onnx", ".bin", ".pth", ".safetensors") else 1
        if path.stat().st_size < floor:
            return False
    return True


@router.get("/runtime")
def runtime():
    """BG6: what this machine offers and which provider sessions will use."""
    import onnxruntime as ort

    chosen = providers()
    return {"active": chosen[0], "available": ort.get_available_providers()}


@router.get("")
def list_models():
    return [
        {
            "id": key,
            "name": spec["name"],
            "license": spec["license"],
            "ready": ready(key),
            "downloading": key in _downloading,
            "files": list(spec["files"]),
            # Krea 2's builds and its filter are installed from their own card, after the licence and the filter choice
            "managedBy": "krea-2"
            if spec.get("consent") == "krea-2" or key == "nsfw-filter"
            else ("klein" if str(spec.get("consent", "")).startswith("klein") else None),
        }
        for key, spec in MODELS.items()
    ]


def download(model: str, report, cancelled):
    if model not in MODELS:
        raise ValueError("Unknown model")
    ROOT.mkdir(parents=True, exist_ok=True)
    with _lock:
        entries = list(MODELS[model]["files"].items())
        for i, (name, url) in enumerate(entries):
            path = ROOT / name
            if path.is_file():
                continue
            # A per-model source may override the declared one; keeping it in a
            # separate name makes clear the loop's value is not being rewritten.
            download_url = source_for(model, name, url)
            limit = int(MODELS[model].get("maxFileBytes", 2_000_000_000))
            path.parent.mkdir(parents=True, exist_ok=True)
            temporary = path.with_suffix(path.suffix + ".download")
            digest = hashlib.sha256()
            try:
                with httpx.stream("GET", download_url, follow_redirects=True, timeout=120) as response:
                    response.raise_for_status()
                    length = int(response.headers.get("content-length", 0))
                    written = 0
                    with temporary.open("wb") as out:
                        for chunk in response.iter_bytes(1024 * 1024):
                            if cancelled():
                                raise InterruptedError("Cancelled")
                            written += len(chunk)
                            if written > limit:
                                raise ValueError("Model exceeds the download limit")
                            out.write(chunk)
                            digest.update(chunk)
                            report((i + (written / length if length else 0.5)) / len(entries))
                # the one-kilobyte floor is for weights; a model's config or tokenizer file can be smaller
                if temporary.stat().st_size < (1024 if path.suffix in (".onnx", ".bin", ".pth", ".safetensors", ".gguf") else 1):
                    raise ValueError("Model download is incomplete")
                expected = PINNED.get(name)
                if not expected:
                    # 1.53.4: a file with no pin is refused, not accepted unchecked (formcut's SD-Turbo entry had none).
                    temporary.unlink(missing_ok=True)
                    raise ValueError(f"{name} has no pinned checksum, so it is not downloaded")
                if digest.hexdigest() != expected:
                    # P8: a file that does not match its pin never lands. It is
                    # deleted and named, so a bad mirror cannot poison the cache.
                    temporary.unlink(missing_ok=True)
                    raise ValueError(f"Checksum mismatch for {name}: expected {expected[:16]}..., got {digest.hexdigest()[:16]}...")
                temporary.replace(path)
                path.with_suffix(path.suffix + ".json").write_text(
                    json.dumps({"url": download_url, "sha256": digest.hexdigest(), "license": MODELS[model]["license"]})
                )
            finally:
                temporary.unlink(missing_ok=True)
    return {"model": model, "ready": ready(model)}


def _tracked(model: str, report, cancelled):
    _downloading.add(model)
    try:
        return download(model, report, cancelled)
    finally:
        _downloading.discard(model)


@router.post("/{model}/download", status_code=202)
def start_download(model: str):
    if model not in MODELS:
        raise HTTPException(404, "Unknown model")
    if MODELS[model].get("consent") == "krea-2":
        from .krea2 import consent

        if not consent().get("licence"):
            raise HTTPException(409, "Krea 2 is installed from its own panel, once its licence is accepted")
    if str(MODELS[model].get("consent", "")).startswith("klein"):
        from .klein import consent as klein_consent

        variant = "flux2-" + MODELS[model]["consent"]
        if not klein_consent().get(variant, {}).get("licence"):
            raise HTTPException(409, "FLUX.2 [klein] is installed from its own card, once its licence is accepted")
    return jobs.submit("model-download", lambda _id, report, cancelled: _tracked(model, report, cancelled))


def _sources() -> dict:
    if SOURCES_FILE.is_file():
        try:
            return json.loads(SOURCES_FILE.read_text())
        except ValueError:
            return {}
    return {}


def source_for(model: str, name: str, default: str) -> str:
    """The URL to fetch a model file from: upstream, a mirror, or a custom URL."""
    chosen = _sources().get(model) or {}
    if isinstance(chosen, dict):
        if chosen.get("mode") == "custom" and chosen.get("url"):
            # A custom source is the exact URL the user gave; only a mirror is
            # treated as a base that the file name is appended to.
            return str(chosen["url"])
        if chosen.get("mode") == "mirror" and chosen.get("url"):
            return f"{str(chosen['url']).rstrip('/')}/{name}"
    return default


def set_source(model: str, mode: str, url: str | None) -> dict:
    """Record where a model should be fetched from."""
    if model not in MODELS:
        raise ValueError("Unknown model")
    if mode not in ("upstream", "mirror", "custom"):
        raise ValueError("Unknown source mode")
    if mode != "upstream" and not url:
        raise ValueError("A mirror or custom source needs a URL")
    ROOT.mkdir(parents=True, exist_ok=True)
    data = _sources()
    data[model] = {"mode": mode, "url": url}
    SOURCES_FILE.write_text(json.dumps(data, indent=2))
    return data[model]


class FolderBody(BaseModel):
    path: str = Field(default="", max_length=1024)


def _folder_state() -> dict:
    from .paths import saved_folder

    env = os.environ.get("FORMVIS_MODELS_DIR") or ""
    saved = saved_folder()
    wanted = Path(env or saved).expanduser().resolve() if (env or saved) else DATA_DIR / "models"
    return {"active": str(ROOT), "saved": saved, "env": env, "restart": wanted != ROOT.resolve()}


@router.get("/folder")
def get_folder():
    """The helper model folder in use, the one saved for the next start, and whether FORMVIS_MODELS_DIR overrides it."""
    return _folder_state()


@router.put("/folder")
def put_folder(body: FolderBody, request: Request):
    """Saves where helper models are kept from the next engine start; an empty path goes back to the data folder. Files already
    downloaded stay where they are."""
    from app.routers.terminal import require_local

    from .paths import FOLDER_FILE

    require_local(request)

    raw = body.path.strip()
    if raw:
        path = Path(raw).expanduser()
        if not path.is_absolute():
            raise HTTPException(400, "Give a full folder path, such as /Volumes/Models or D:\\Models")
        try:
            path.mkdir(parents=True, exist_ok=True)
            probe = path / ".formvis-write-test"
            probe.write_text("x")
            probe.unlink()
        except OSError:
            raise HTTPException(400, "That folder cannot be created or written to")
        FOLDER_FILE.write_text(str(path.resolve()))
    else:
        FOLDER_FILE.unlink(missing_ok=True)
    return _folder_state()


@router.delete("/{model}")
def remove_model(model: str):
    """Delete a downloaded model's files from the model folder (those managed by the Krea 2 and klein cards have their own)."""
    if model not in MODELS:
        raise HTTPException(404, "Unknown model")
    if MODELS[model].get("consent") or model == "nsfw-filter":
        raise HTTPException(409, "This model is removed from its own card")
    if model in _downloading:
        raise HTTPException(409, "This model is downloading")
    with _lock:
        for name in MODELS[model]["files"]:
            path = ROOT / name
            path.unlink(missing_ok=True)
            path.with_suffix(path.suffix + ".json").unlink(missing_ok=True)
            parent = path.parent
            while parent != ROOT and ROOT in parent.parents:
                try:
                    parent.rmdir()
                except OSError:
                    break
                parent = parent.parent
    return {"model": model, "ready": ready(model)}


class SourceBody(BaseModel):
    mode: str = "upstream"
    url: str | None = Field(default=None, max_length=2048)


@router.get("/sources")
def get_sources():
    """Where each model is fetched from: only the models given a mirror or a custom URL are listed."""
    return {"models": {key: value for key, value in _sources().items() if key in MODELS and isinstance(value, dict)}}


@router.put("/{model}/source")
def put_source(model: str, body: SourceBody):
    """Fetch this model from its upstream URL, from a mirror (a base the file name is appended to) or from a custom URL."""
    if model not in MODELS:
        raise HTTPException(404, "Unknown model")
    url = (body.url or "").strip() or None
    if url and not url.lower().startswith(("https://", "http://")):
        raise HTTPException(400, "The address starts with https://")
    try:
        return set_source(model, body.mode, url if body.mode != "upstream" else None)
    except ValueError as err:
        raise HTTPException(400, str(err))


def pin_for(name: str) -> str | None:
    return PINNED.get(name)
