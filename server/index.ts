import { PORT, URL } from './config';
import express from 'express';
import mongoose from "mongoose";
import { Schedule } from '../models/schedModel'

const app = express();

app.use(express.json());

app.get('/', (request, response)=>{
  console.log(request)
  return response.status(234).send('nodemon works boys')
})

app.get('/schedule', async (request, response) => {
  try {
    const schedule = await Schedule.find({})
    return response.status(200).send({
      count: schedule.length,
      data: schedule
  })
  } catch (error) {
    console.log(error)
    response.status(234)
  }
})

app.post('/schedule', async (request, response) => {
  try {
    if (
      !request.body.leader ||
      !request.body.acoustic
    ){
      return response.status(400).send({
        message: "Send all required fields"
    });
    }
    const newSched = {
      leader: request.body.leader,
      acoustic: request.body.acoustic
  };

    const schedule = await Schedule.create(newSched)
    return response.status(201).send(schedule)
  } catch (error) {
    console.log(error)
    response.status(500).send({})
  }
})

mongoose
  .connect(URL)
  .then(() => {
    console.log('App connected to database');
    app.listen(PORT, () => {
        console.log(`App is listening to port: ${PORT}`);
    });
  })
  .catch((error) => {
    console.log(error);
  })