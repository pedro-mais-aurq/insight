FROM ubuntu:24.04@sha256:33ceb71981b602c1a7443a53469e4dba065f7503eab3078a2d7a57a2ab987517 AS orca

ARG DEBIAN_FRONTEND=noninteractive
ARG UBUNTU_SNAPSHOT=20260707T120000Z
ARG ORCA_VERSION=2.4.2
ARG ORCA_APPIMAGE_SHA256=d12fb8c8eac1aecd2dfb6377acd48f994f8fa439ed5292fa532dd82880f029fd
ARG ORCA_APPIMAGE_URL=https://github.com/OrcaSlicer/OrcaSlicer/releases/download/v2.4.2/OrcaSlicer_Linux_AppImage_Ubuntu2404_V2.4.2.AppImage

RUN apt update \
    && apt install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && apt install -y --no-install-recommends \
      --update \
      --snapshot "${UBUNTU_SNAPSHOT}" \
      curl nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

RUN curl --fail --location --proto '=https' --tlsv1.2 \
      --output OrcaSlicer.AppImage "${ORCA_APPIMAGE_URL}" \
    && echo "${ORCA_APPIMAGE_SHA256}  OrcaSlicer.AppImage" | sha256sum --check --strict \
    && chmod 0555 OrcaSlicer.AppImage \
    && ./OrcaSlicer.AppImage --appimage-extract >/dev/null \
    && test -x squashfs-root/AppRun \
    && test -d squashfs-root/resources/profiles

COPY package.json /build/package.json
COPY src/profile /build/src/profile
COPY scripts/flatten-presets.js /build/scripts/flatten-presets.js

ENV ORCA_PROFILE_SOURCE_ROOT=/build/squashfs-root/resources/profiles \
    PROFILE_OUTPUT_ROOT=/build/profiles \
    ORCA_VERSION=2.4.2 \
    PROFILE_GENERATED_AT=2026-07-07T03:33:00.000Z

RUN node /build/scripts/flatten-presets.js


FROM ubuntu:24.04@sha256:33ceb71981b602c1a7443a53469e4dba065f7503eab3078a2d7a57a2ab987517 AS runtime

ARG DEBIAN_FRONTEND=noninteractive
ARG UBUNTU_SNAPSHOT=20260707T120000Z

RUN apt update \
    && apt install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && apt install -y --no-install-recommends \
      --update \
      --snapshot "${UBUNTU_SNAPSHOT}" \
      nodejs unzip zip xvfb xauth \
      libwebkit2gtk-4.1-0 libgtk-3-0 libglu1-mesa libgl1 \
      libegl1 libdbus-1-3 libfontconfig1 libfreetype6 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 insight \
    && useradd --system \
      --uid 10001 \
      --gid insight \
      --home-dir /nonexistent \
      --shell /usr/sbin/nologin \
      insight \
    && install -d -o insight -g insight -m 0700 \
      /work \
      /app/profiles \
      /work/orca-state \
      /work/orca-state/config \
      /work/orca-state/cache \
      /work/orca-state/runtime

WORKDIR /app

COPY --from=orca --chown=root:root /build/squashfs-root /opt/orca
COPY --from=orca --chown=root:root /build/profiles /app/profiles

COPY --chown=root:root package.json ./package.json
COPY --chown=root:root src ./src
COPY --chown=root:root THIRD_PARTY_NOTICES.md /usr/share/doc/insight/THIRD_PARTY_NOTICES.md



ENV NODE_ENV=production \
    PORT=8080 \
    WORK_ROOT=/work \
    ORCA_SLICER_BIN=/opt/orca/AppRun \
    ORCA_STATE_ROOT=/work/orca-state \
    PROFILE_ROOT=/app/profiles \
    HOME=/work \
    SLICER_TIMEOUT_MS=90000 \
    SLICER_MAX_CONCURRENT=1 \
    MAX_MODEL_BYTES=50000000 \
    MAX_WEIGHT_GRAMS=10000 \
    MAX_PRINT_TIME_SECONDS=2592000

USER 10001:10001

EXPOSE 8080

VOLUME ["/work"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]


FROM runtime AS validation

COPY --chown=insight:insight test/orca-smoke.js /app/test/orca-smoke.js
COPY --chown=insight:insight test/fixtures/cube.stl /app/test/fixtures/cube.stl
COPY --chown=insight:insight test/fixtures/overhang.obj /app/test/fixtures/overhang.obj
COPY --chown=insight:insight test/fixtures/outside-build-volume.obj /app/test/fixtures/outside-build-volume.obj

RUN node /app/test/orca-smoke.js \
    && touch /work/orca-smoke-passed


FROM runtime AS final

COPY --from=validation --chown=insight:insight \
  /work/orca-smoke-passed \
  /app/orca-smoke-passed