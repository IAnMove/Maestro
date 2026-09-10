"""MCP connection settings for the trusted application UI, not an MCP tool."""
import ipaddress
import socket

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict


class McpAccessUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    enabled: bool
    rotate: bool = False


def require_settings_origin(request: Request):
    host = request.url.hostname
    try:
        address = ipaddress.ip_address(host or '')
        known_host = address.is_loopback or address.is_private
    except ValueError:
        known_host = host in {'localhost', socket.gethostname(), socket.getfqdn()}
    if not known_host or request.headers.get('origin') != f'{request.url.scheme}://{request.url.netloc}':
        raise HTTPException(403, 'Open MCP settings from the local application address.')


def create_mcp_access_router(access):
    router = APIRouter()

    @router.get('/api/v1/settings/mcp')
    def status(response: Response):
        response.headers['Cache-Control'] = 'no-store'
        return access.status()

    @router.put('/api/v1/settings/mcp')
    def update(value: McpAccessUpdate, request: Request, response: Response):
        require_settings_origin(request)
        response.headers['Cache-Control'] = 'no-store'
        try:
            return access.update(value.enabled, value.rotate)
        except ValueError as error:
            raise HTTPException(409, str(error)) from error

    return router
