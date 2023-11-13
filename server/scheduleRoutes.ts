import express, { Request, Response } from 'express';
import { Schedule } from '../models/schedModel';

const router = express.Router();
  
router.get('/schedule', async (req: Request, res: Response) => {
try {
    const schedules = await Schedule.find({});
    res.status(200).json({
    count: schedules.length,
    data: schedules,
    });
} catch (error) {
    console.error(error);
    res.status(500).send({});
}
});
  
router.post('/schedule', async (req: Request, res: Response) => {
try {
    const { leader, acoustic } = req.body;

    if (!leader || !acoustic) {
    return res.status(400).json({
        message: 'Send all required fields',
    });
    }

    const newSched = await Schedule.create({ leader, acoustic });
    res.status(201).json(newSched);
} catch (error) {
    console.error(error);
    res.status(500).send({});
}
});
  
router.put('/schedule/:id', async (req: Request, res: Response) => {
const id = req.params.id;

try {
    const { leader, acoustic } = req.body;

    if (!leader || !acoustic) {
    return res.status(400).json({
        message: 'Send all required fields',
    });
    }

    const updatedSched = await Schedule.findByIdAndUpdate(id, { leader, acoustic }, { new: true });
    res.status(201).json(updatedSched);
} catch (error) {
    console.error(error);
    res.status(500).send({});
}
});
  
router.delete('/schedule/:id', async (req: Request, res: Response) => {
const id = req.params.id;

try {
    const deletedSched = await Schedule.findByIdAndDelete(id);

    if (!deletedSched) {
    return res.status(404).json({ error: 'ID not found' });
    }

    res.status(201).send('Schedule deleted successfully');
} catch (error) {
    console.error(error);
    res.status(500).send({});
}
});

export default router;