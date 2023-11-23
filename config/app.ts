import express from 'express';
import cors from 'cors';
import { json } from 'express';
import SchedRoutes from '../routes/scheduleRoutes';

export const configureApp = (app: express.Application): void => {
  app.use(json());
  app.use(cors());
  app.use('/', SchedRoutes);
};
