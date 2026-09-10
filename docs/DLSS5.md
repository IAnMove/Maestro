# DLSS opcional en HocusPocus

El puente Python está integrado en Postprocesado y Tools. En Linux queda
deshabilitado con el motivo correspondiente. Neural Rendering requiere Windows
11 y hardware/runtime compatible; Frame Generation requiere RTX 40 o posterior
y HAGS. Las escalas ×5/×6 solo se ofrecen en RTX 50 cuando el worker las admite.

Los componentes nativos son externos al repositorio. Consultar la
[guía de WanGP fijada a la revisión integrada](https://github.com/deepbeepmeep/Wan2GP/blob/362c3467a70e1136ceb52eec95907205a8f88543/docs/DLSS5.md)
para procedencia, licencias y hashes de los workers y sus dependencias. El
launcher de HocusPocus no ejecuta su instalador ni incorpora DLL modificadas.

La carpeta del runtime es `app/dlss5/`, distinta de `app/postprocessing/dlss5/`:

```text
app/dlss5/
  host/nr-depth-worker.exe
  host/dxgi.dll
  host/renodx-dlss5.addon64
  host/nvngx_dlssnr.dll
  dlss/nvngx_dlss.dll
  dlssg/dlssg-worker.exe
  dlssg/nvngx_dlssg.dll
```

Tras instalar componentes obtenidos con sus permisos correspondientes, reiniciar
el servidor. La detección valida los requisitos y consulta las capacidades del
worker. Depth Anything V2 y, si se selecciona, RAFT se descargan bajo demanda en
la raíz de checkpoints habitual, reutilizando los existentes. Los ajustes
`dlss5.depth_resolution` (`full`, `half`, `quarter`) y `dlss5.motion_vector`
(`original`, `raft`) permanecen en la configuración del motor. HocusPocus expone
intensidad y escala en el panel de postprocesado.

No se ha ejecutado DLSS nativo durante esta integración. La disponibilidad de un
menú o una prueba simulada no demuestra calidad ni compatibilidad del runtime
Windows instalado por cada usuario.
