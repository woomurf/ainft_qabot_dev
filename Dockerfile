FROM node:16.13.2-alpine

COPY . /app
WORKDIR /app

RUN npm install

EXPOSE "${PORT}"

CMD ["npm", "start"]
