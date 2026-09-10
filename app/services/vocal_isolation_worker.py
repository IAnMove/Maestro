"""One CPU job, no network, no model discovery/download, no persistent AI runtime."""
from pathlib import Path
import sys


def installed_separator(separator_type, folder, name):
    class InstalledOnly(separator_type):
        def download_model_files(self, model_filename):
            if model_filename != name + '.ckpt':
                raise ValueError('Only the installed RoFormer model is supported')
            checkpoint, config = folder / (name + '.ckpt'), folder / (name + '.yaml')
            if not checkpoint.is_file() or not config.is_file():
                raise FileNotFoundError('Optional model is missing')
            return model_filename, 'MDXC', 'BS-RoFormer (installed)', str(checkpoint), str(config)

        def download_file_if_not_exists(self, *args, **kwargs):
            raise RuntimeError('Downloads are disabled for optional vocal isolation')

    return InstalledOnly


def main(source, target, model_dir, name):
    # Block outbound networking even if a dependency changes its download path.
    import socket
    def offline(*args, **kwargs):
        raise OSError('Network disabled during local vocal isolation')
    socket.create_connection = offline
    socket.socket.connect = offline
    socket.socket.connect_ex = offline
    import logging
    import numpy as np
    import soundfile as sf
    import torch
    from scipy.signal import resample_poly
    from audio_separator.separator import Separator

    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    cls = installed_separator(Separator, Path(model_dir), name)
    separator = cls(model_file_dir=model_dir, output_dir=str(Path(target).parent),
                    output_format='WAV', output_single_stem='Vocals', use_soundfile=True,
                    log_level=logging.ERROR, mdxc_params={'segment_size': 256,
                    'override_model_segment_size': True, 'batch_size': 1, 'overlap': 2, 'pitch_shift': 0})
    separator.torch_device = torch.device('cpu')
    separator.torch_device_mps = None
    separator.load_model(name + '.ckpt')
    files = separator.separate(source, custom_output_names={'Vocals': 'isolated'})
    if len(files) != 1:
        raise ValueError('Expected one vocal stem')
    stem = Path(files[0])
    if not stem.is_absolute():
        stem = Path(target).parent / stem
    samples, rate = sf.read(stem, always_2d=True)
    mono = samples.mean(axis=1)
    mono = resample_poly(mono, 16000, rate)
    frames = sf.info(source).frames
    mono = np.pad(mono[:frames], (0, max(0, frames - len(mono))))
    if not np.isfinite(mono).all():
        raise ValueError('Invalid isolated waveform')
    sf.write(target, mono, 16000, subtype='PCM_16')


if __name__ == '__main__':
    main(*sys.argv[1:])
