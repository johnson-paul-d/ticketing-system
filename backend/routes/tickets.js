const express = require('express');
const router = express.Router();

const supabase = require('../config/supabase');
const auth = require('../middleware/auth');

/*
=====================================================
GET ALL TICKETS
=====================================================
*/
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
    console.log('GET TICKETS ERROR:', error);

    res.status(500).json({
      message: 'Failed to fetch tickets'
    });
  }
});

/*
=====================================================
GET SINGLE TICKET
=====================================================
*/
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
    console.log('GET SINGLE TICKET ERROR:', error);

    res.status(500).json({
      message: 'Failed to fetch ticket'
    });
  }
});

/*
=====================================================
CREATE TICKET
=====================================================
*/
router.post('/', auth, async (req, res) => {
  try {

    const {
      title,
      description,
      category,
      priority,
      division,
      due_date
    } = req.body;

    const { data, error } = await supabase
      .from('tickets')
      .insert([
        {
          title,
          description,
          category,
          priority,
          division,
          due_date,

          status: 'Open',

          created_by: req.user.id,
          created_by_name: req.user.name,

          deleted: false
        }
      ])
      .select();

    if (error) {
      console.log(error);
      throw error;
    }

    res.status(201).json(data[0]);

  } catch (error) {
    console.log('CREATE TICKET ERROR:', error);

    res.status(500).json({
      message: 'Failed to create ticket'
    });
  }
});

/*
=====================================================
UPDATE TICKET STATUS
=====================================================
*/
router.put('/:id/status', auth, async (req, res) => {
  try {

    const { status } = req.body;

    const { data, error } = await supabase
      .from('tickets')
      .update({
        status,
        updated_at: new Date()
      })
      .eq('id', req.params.id)
      .select();

    if (error) throw error;

    res.json(data[0]);

  } catch (error) {
    console.log('STATUS UPDATE ERROR:', error);

    res.status(500).json({
      message: 'Failed to update status'
    });
  }
});

/*
=====================================================
ASSIGN TICKET
=====================================================
*/
router.put('/:id/assign', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    const {
      assigned_to,
      assigned_to_name
    } = req.body;

    const { data, error } = await supabase
      .from('tickets')
      .update({
        assigned_to,
        assigned_to_name,
        updated_at: new Date()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: 'Assignment failed'
    });
  }
});

/*
=====================================================
UNASSIGN TICKET
=====================================================
*/
router.put('/:id/unassign', auth, async (req, res) => {
  try {

    const { data, error } = await supabase
      .from('tickets')
      .update({
        assigned_to: null,
        assigned_to_name: null,
        updated_at: new Date()
      })
      .eq('id', req.params.id)
      .select();

    if (error) throw error;

    res.json(data[0]);

  } catch (error) {
    console.log('UNASSIGN ERROR:', error);

    res.status(500).json({
      message: 'Unassign failed'
    });
  }
});

/*
=====================================================
DELETE TICKET (SOFT DELETE)
=====================================================
*/
router.delete('/:id', auth, async (req, res) => {
  try {

    if (req.user.role !== 'Admin') {
      return res.status(403).json({
        message: 'Access denied'
      });
    }

    const { error } = await supabase
      .from('tickets')
      .update({
        deleted: true,
        updated_at: new Date()
      })
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({
      message: 'Ticket deleted'
    });

  } catch (error) {
    console.log('DELETE ERROR:', error);

    res.status(500).json({
      message: 'Delete failed'
    });
  }
});

module.exports = router;