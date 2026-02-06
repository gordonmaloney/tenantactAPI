# TenantAct API

This repository exposes a small API for writing to the TenantAct database.

## Contribute

The API runs on [Node.js](https://nodejs.org/en) and writes to a [MongoDB](https://www.mongodb.com/) database. There are many ways to run a [MongoDB](https://www.mongodb.com/) database locally. Follow these steps to use [Docker](https://www.docker.com/) to run a database for local development.

After installing Docker, run the following to start a MongoDB server.

```
export MONGODB_VERSION=8.0-ubi8
docker run --name mongodb -d -p 27017:27017 mongodb/mongodb-community-server:$MONGODB_VERSION
```

The database will be available at `mongodb://localhost:27017`.

Run the following to stop the docker container.

```
docker stop mongodb
```

Run the following to delete the data and remove the docker container.

```
docker rm mongodb
```

After cloning this repository, install the [Node.js](https://nodejs.org/en) dependencies.

```
npm install
```

Copy the `.env.dev` file to `.env` and set the variables to match your MongoDB setup. You can generate compatible keys with teh command `openssl rand -base64 32`.

```
PASSWORD=password
MONGODB_URI=mongodb://localhost:27017
MONGODB_DBNAME=example

# Must be base64 32 bit strings
PIIFIELD_KEY=...
PII_HMAC_KEY=...

# For local development only
DISABLE_CORS=true
```

Install the [Vercel CLI](https://vercel.com/docs/cli) (you will need a Vercel account).

```
npm i -g vercel
```

Run the vercel app.

```
vercel dev
```

The API should be accepting requests at `http://localhost:3000` or a similar URL.
