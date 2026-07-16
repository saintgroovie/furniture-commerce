FROM node:20-alpine
WORKDIR /server
COPY package.json yarn.lock* .yarnrc.yml ./
COPY .yarn/ .yarn/
RUN corepack enable && yarn install
COPY . .
EXPOSE 9000 5173
ENTRYPOINT ["sh", "./start.sh"]
