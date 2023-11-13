import { PORT, URL } from './config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors'
import SchedRoutes from './scheduleRoutes';

const app = express();

app.use(express.json());

app.use(cors())

app.use('/', SchedRoutes)

mongoose
  .connect(URL)
  .then(() => {
    console.log('App connected to database');
    app.listen(PORT, () => {
      console.log(`App is listening to port: ${PORT}`);
    });
  })
  .catch((error) => {
    console.error(error);
  });
