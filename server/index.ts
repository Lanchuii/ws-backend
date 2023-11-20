import { PORT, URL } from './config';
import express from 'express';
import mongoose, { mongo } from 'mongoose';
import cors from 'cors'
import SchedRoutes from './scheduleRoutes';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const mongodbURL: string = process.env.MONGODB_URL || '';

app.use(express.json());

app.use(cors())

app.use('/', SchedRoutes)

mongoose
  .connect(mongodbURL)
  .then(() => {
    console.log('App connected to database');
    app.listen(PORT, () => {
      console.log(`App is listening to port: ${PORT}`);
    });
  })
  .catch((error) => {
    console.error(error);
  });
