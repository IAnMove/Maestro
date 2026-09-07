"""Pinned SenseNova catalog adapter for Maestro's internal WanGP engine."""

from shared.wangp1272.assets import pin_downloads, pin_urls
from .sensenova_u1_handler import family_handler as UpstreamHandler


class family_handler(UpstreamHandler):
    @staticmethod
    def query_model_def(base_model_type, model_def):
        result = pin_urls(UpstreamHandler.query_model_def(base_model_type, model_def))
        result.update(wangp_1272=True, compile=False)
        return result

    @staticmethod
    def query_model_files(computeList, base_model_type, model_def=None):
        return pin_downloads(UpstreamHandler.query_model_files(computeList, base_model_type, model_def))
