const express = require('express');

const router = express.Router();

const supabase =
  require('../config/supabase');

const auth =
  require('../middleware/auth');

/*
=====================================================
GET ALL TICKETS
=====================================================
*/
router.get(
  '/',
  auth,
  async (req, res) => {

    try {

      let query =
        supabase
          .from('tickets')
          .select('*')
          .eq('deleted', false)
          .order(
            'created_at',
            {
              ascending: false
            }
          );

      // TEAM MEMBER FILTER
      if (
        req.user.role ===
        'Team Member'
      ) {

        query =
          query.eq(
            'assigned_to_name',
            req.user.name
          );
      }

      const {
        data,
        error
      } = await query;

      if (error) throw error;

      res.json(data);

    } catch (error) {

      console.log(
        'GET TICKETS ERROR:',
        error
      );

      res.status(500).json({
        message:
          'Failed to fetch tickets'
      });
    }
  }
);

/*
=====================================================
GET SINGLE TICKET
=====================================================
*/
router.get(
  '/:id',
  auth,
  async (req, res) => {

    try {

      const {
        data,
        error
      } = await supabase
        .from('tickets')
        .select('*')
        .eq(
          'id',
          req.params.id
        )
        .single();

      if (error) throw error;

      res.json(data);

    } catch (error) {

      console.log(
        'GET SINGLE TICKET ERROR:',
        error
      );

      res.status(500).json({
        message:
          'Failed to fetch ticket'
      });
    }
  }
);

/*
=====================================================
CREATE TICKET
=====================================================
*/
router.post(
  '/',
  auth,
  async (req, res) => {

    try {

      const {
        title,
        description,
        category,
        priority,
        division,
        due_date
      } = req.body;

      const history = [
        {
          action:
            'Ticket created',

          user:
            req.user.name,

          date:
            new Date().toLocaleString()
        }
      ];

      const {
        data,
        error
      } = await supabase
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

            history,

            created_by:
              req.user.id,

            created_by_name:
              req.user.name,

            deleted: false
          }
        ])
        .select();

      if (error) {
        console.log(error);
        throw error;
      }

      res
        .status(201)
        .json(data[0]);

    } catch (error) {

      console.log(
        'CREATE TICKET ERROR:',
        error
      );

      res.status(500).json({
        message:
          'Failed to create ticket'
      });
    }
  }
);

/*
=====================================================
UPDATE TICKET
=====================================================
*/
router.put(
  '/:id',
  auth,
  async (req, res) => {

    try {

      const { id } =
        req.params;

      const updates =
        req.body;

      // GET EXISTING
      const {
        data: existingTicket
      } = await supabase
        .from('tickets')
        .select('*')
        .eq('id', id)
        .single();

      let history =
        existingTicket.history || [];

      // DUE DATE HISTORY
      if (
        updates.due_date &&
        updates.due_date !==
          existingTicket.due_date
      ) {

        history.push({
          action:
            `Due date changed to ${updates.due_date}`,

          user:
            req.user.name,

          date:
            new Date().toLocaleString()
        });
      }

      // STATUS HISTORY
      if (
        updates.status &&
        updates.status !==
          existingTicket.status
      ) {

        history.push({
          action:
            `Status changed to ${updates.status}`,

          user:
            req.user.name,

          date:
            new Date().toLocaleString()
        });
      }

      const {
        data,
        error
      } = await supabase
        .from('tickets')
        .update({
          ...updates,

          history,

          updated_at:
            new Date()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      res.json(data);

    } catch (error) {

      console.log(
        'UPDATE TICKET ERROR:',
        error
      );

      res.status(500).json({
        message:
          'Failed to update ticket'
      });
    }
  }
);

/*
=====================================================
UPDATE STATUS
=====================================================
*/
router.put(
  '/:id/status',
  auth,
  async (req, res) => {

    try {

      const { status } =
        req.body;

      // GET EXISTING
      const {
        data: existing
      } = await supabase
        .from('tickets')
        .select('*')
        .eq(
          'id',
          req.params.id
        )
        .single();

      const history =
        existing.history || [];

      history.push({
        action:
          `Status changed to ${status}`,

        user:
          req.user.name,

        date:
          new Date().toLocaleString()
      });

      const {
        data,
        error
      } = await supabase
        .from('tickets')
        .update({
          status,

          history,

          updated_at:
            new Date()
        })
        .eq(
          'id',
          req.params.id
        )
        .select();

      if (error) throw error;

      res.json(data[0]);

    } catch (error) {

      console.log(
        'STATUS UPDATE ERROR:',
        error
      );

      res.status(500).json({
        message:
          'Failed to update status'
      });
    }
  }
);

/*
=====================================================
ASSIGN TICKET
=====================================================
*/
router.put(
  '/:id/assign',
  auth,
  async (req, res) => {

    try {

      const { id } =
        req.params;

      const {
        assigned_to,
        assigned_to_name
      } = req.body;

      // GET EXISTING
      const {
        data: existing
      } = await supabase
        .from('tickets')
        .select('*')
        .eq('id', id)
        .single();

      const history =
        existing.history || [];

      history.push({
        action:
          `Assigned to ${assigned_to_name}`,

        user:
          req.user.name,

        date:
          new Date().toLocaleString()
      });

      const {
        data,
        error
      } = await supabase
        .from('tickets')
        .update({
          assigned_to,
          assigned_to_name,

          history,

          updated_at:
            new Date()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      res.json(data);

    } catch (error) {

      console.log(
        'ASSIGN ERROR:',
        error
      );

      res.status(500).json({
        message:
          'Assignment failed'
      });
    }
  }
);

/*
=====================================================
UNASSIGN TICKET
=====================================================
*/
router.put(
  '/:id/unassign',
  auth,
  async (req, res) => {

    try {

      // GET EXISTING
      const {
        data: existing
      } = await supabase
        .from('tickets')
        .select('*')
        .eq(
          'id',
          req.params.id
        )
        .single();

      const history =
        existing.history || [];

      history.push({
        action:
          'Ticket unassigned',

        user:
          req.user.name,

        date:
          new Date().toLocaleString()
      });

      const {
        data,
        error
      } = await supabase
        .from('tickets')
        .update({
          assigned_to: null,
          assigned_to_name: null,

          history,

          updated_at:
            new Date()
        })
        .eq(
          'id',
          req.params.id
        )
        .select();

      if (error) throw error;

      res.json(data[0]);

    } catch (error) {

      console.log(
        'UNASSIGN ERROR:',
        error
      );

      res.status(500).json({
        message:
          'Unassign failed'
      });
    }
  }
);

/*
=====================================================
DELETE TICKET
=====================================================
*/
router.delete(
  '/:id',
  auth,
  async (req, res) => {

    try {

      if (
        req.user.role !==
        'Admin'
      ) {

        return res
          .status(403)
          .json({
            message:
              'Access denied'
          });
      }

      const { error } =
        await supabase
          .from('tickets')
          .update({
            deleted: true,

            updated_at:
              new Date()
          })
          .eq(
            'id',
            req.params.id
          );

      if (error) throw error;

      res.json({
        message:
          'Ticket deleted'
      });

    } catch (error) {

      console.log(
        'DELETE ERROR:',
        error
      );

      res.status(500).json({
        message:
          'Delete failed'
      });
    }
  }
);

module.exports = router;