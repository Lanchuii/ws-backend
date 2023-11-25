import express from 'express';
import dotenv from 'dotenv';
import { configureApp } from '../config/app';
import getDbConfig, { connectToDatabase } from '../config/db';

dotenv.config();
const app = express();

const dbConfig = getDbConfig();
const mongodbURL = dbConfig.databaseUrl;
const PORT = process.env.PORT || 3000

configureApp(app)

connectToDatabase(mongodbURL)
  .then(() => {
    console.log('App connected to database');
    app.listen(PORT, () => {
      console.log(`App is listening to port: ${PORT}`);
      console.log(`App running on ${process.env.NODE_ENV}`);
    });
  })
  .catch((error) => {
    console.error(error);
  });
