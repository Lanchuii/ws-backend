import express from 'express';
import dotenv from 'dotenv';
import { configureApp } from '../config/app';
import { connectToDatabase } from '../config/db';

dotenv.config();

const app = express();
const mongodbURL: string = process.env.MONGODB_URL || '';
const PORT = process.env.PORT || 3000

configureApp(app)

connectToDatabase(mongodbURL)
  .then(() => {
    console.log('App connected to database');
    app.listen(PORT, () => {
      console.log(`App is listening to port: ${PORT}`);
    });
  })
  .catch((error) => {
    console.error(error);
  });
