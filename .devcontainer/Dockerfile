FROM mcr.microsoft.com/playwright:v1.63.0-noble

RUN corepack enable \
  && corepack prepare pnpm@12.8.1 --activate

# Dev Container用にubuntuへsudoを許可
RUN apt-get update \
  && apt-get install -y --no-install-recommends sudo \
  && echo "ubuntu ALL=(root) NOPASSWD:ALL" > /etc/sudoers.d/ubuntu \
  && chmod 0440 /etc/sudoers.d/ubuntu \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspaces/vercel-study-app