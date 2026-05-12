const express = require('express');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

const supabase = require('../config/supabase');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('tickets')
      .select('*')
      .eq('deleted', false)
      .order('created_at', {
        ascending: false
      });

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: 'Failed to fetch tickets'
    });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: 'Failed to fetch ticket'
    });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const ticketData = {
      ...req.body,
      id: uuidv4(),
      deleted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('tickets')
      .insert([ticketData])
      .select();

    if (error) throw error;

    req.io.emit('ticketCreated', data[0]);

    res.status(201).json(data[0]);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: 'Failed to create ticket'
    });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const payload = {
      ...req.body,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('tickets')
      .update(payload)
      .eq('id', req.params.id)
      .select();

    if (error) throw error;

    req.io.emit('ticketUpdated', data[0]);

    res.json(data[0]);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: 'Failed to update ticket'
    });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('tickets')
      .update({
        deleted: true,
        status: 'Deleted',
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .select();

    if (error) throw error;

    req.io.emit('ticketDeleted', data[0]);

    res.json({
      message: 'Ticket deleted successfully'
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: 'Failed to delete ticket'
    });
  }
});

module.exports = router;