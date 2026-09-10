"""WanGP processor adapters shared by the native engine and Hocuspocus Tools."""
from postprocessing import spatial_upsamplers as spatial_api
from postprocessing import temporal_upsamplers as temporal_api
from postprocessing.processor_status import handler_status, handler_reason_disabled
import math
from .audio import generation_audio_context

SPATIAL = [
    'postprocessing.h3_face_refiner.wgp_bridge.H3FaceRefinerBridge',
    'postprocessing.dlss5.spatial_upsampler.DLSS5SpatialUpsampler',
]
TEMPORAL = ['postprocessing.dlss5.temporal_upsampler.DLSSGTemporalUpsampler']


def register(config, locator):
    spatial_api.register_spatial_upsamplers(config, locator, handler_modules=SPATIAL)
    temporal_api.register_temporal_upsamplers(config, locator, handler_modules=TEMPORAL)


def is_spatial(value):
    return spatial_api.find_postprocessing_upsampler(value) is not None


def spatial(sample, value, **kwargs):
    handler = spatial_api.find_postprocessing_upsampler(value)
    error = handler.validate_upsampling(value, int(kwargs.get('still_image', False)))
    if error:
        raise ValueError(error)
    from .audio import decoded_source_audio
    with decoded_source_audio(kwargs.get('source_audio_path')) as audio_path:
        kwargs['source_audio_path'] = audio_path
        output, _ = spatial_api.upscale_postprocessing(handler, sample, value, **kwargs)
    return output


def temporal(sample, previous_last_frame, value, fps, **kwargs):
    return temporal_api.temporal_upsample(value, sample, previous_last_frame, fps, **kwargs)


def capabilities():
    methods = []
    for kind, handlers, definition in [
        ('spatial', spatial_api.upsampler_handlers(), 'query_upsampler_def'),
        ('temporal', temporal_api.registered_temporal_upsamplers(), 'query_temporal_upsampler_def'),
    ]:
        for handler in handlers:
            spec = getattr(handler, definition)()
            for label, method in spec['methods']:
                for scale in spec.get('multipliers', {}).get(method, [None]):
                    methods.append(dict(value=method if scale is None else f'{method}*{scale:g}',
                                        label=label if scale is None else f'{label} ×{scale:g}',
                                        kind=kind, media=spec.get('media', ['video']),
                                        enabled=handler_status(handler) == 'enabled',
                                        reason=handler_reason_disabled(handler),
                                        parameters=[parameter for parameter in spec.get('method_parameters', {}).get(method, []) if parameter['type'] in {'number', 'integer', 'string'}]))
    return methods


def classic_choices(kind):
    return [(item['label'] + (f" ({item['reason']})" if item['reason'] else ''), item['value'])
            for item in capabilities() if item['kind'] == kind]


def validate_selection(spatial_value='', temporal_value='', image=False):
    if is_spatial(spatial_value):
        error = spatial_api.validate_postprocessing_spatial_upsampling(spatial_value, int(image))
        if error:
            return error
    if str(temporal_value).startswith('dlssg'):
        return temporal_api.validate_temporal_upsampling(temporal_value, source_is_image=image)
    if image and temporal_value:
        return 'Frame interpolation requires video'
    return ''


def validated_settings(method, values):
    """Only declared scalar parameters cross the runtime kwargs boundary."""
    if values is None:
        return {}
    if not isinstance(values, dict):
        raise ValueError('Processor settings must be an object')
    allowed = {item['name']: item for item in spatial_api.method_parameters(str(method).split('*')[0])}
    result = {}
    for name, value in values.items():
        spec = allowed.get(name)
        if spec is None:
            continue  # Settings for a previously selected processor are harmless.
        if spec['type'] not in {'number', 'integer', 'string'}:
            raise ValueError(f'Unsupported processor parameter: {name}')
        if spec['type'] == 'string':
            if not isinstance(value, str):
                raise ValueError(f'{name} must be text')
        else:
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                raise ValueError(f'{name} must be a finite number')
            if not spec.get('minimum', -math.inf) <= value <= spec.get('maximum', math.inf):
                raise ValueError(f'{name} is outside the supported range')
            if spec['type'] == 'integer' and value != int(value):
                raise ValueError(f'{name} must be an integer')
        result[name] = value
    return result
