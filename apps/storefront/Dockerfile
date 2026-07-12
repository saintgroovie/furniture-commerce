FROM node:20-alpine
WORKDIR /app
COPY package.json yarn.lock* .yarnrc.yml ./
COPY .yarn/ .yarn/
RUN corepack enable && yarn install
COPY . .
EXPOSE 3002
ENV PORT=3002
ENV HOSTNAME=0.0.0.0
ENTRYPOINT ["sh", "./start.sh"]
