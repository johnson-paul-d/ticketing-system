const supabase = require('../config/supabase');
const getISTTime = require('../utils/time');
const { addInterval, occurrenceTitle } = require('../utils/recurrence');
const { notifyUser } = require('./notificationService');

const todayIST = () => new Date(Date.now() + 330 * 60000).toISOString().split('T')[0];

// Migration not run yet (or table missing) → skip quietly.
const isMissingRecurrenceSchema = (error) =>
  error && ['42703', 'PGRST204', 'PGRST205', '42P01'].includes(error.code);

let running = false;

// Generate any recurring occurrences whose scheduled date has arrived. Runs on
// a timer and on boot; catches up on periods missed while the server was down.
async function generateDueRecurrences(io) {
  if (running) return;
  running = true;
  try {
    const today = todayIST();
    const { data: templates, error } = await supabase
      .from('tickets')
      .select('*')
      .eq('is_recurring', true)
      .lte('recurrence_next', today);
    if (error) {
      if (!isMissingRecurrenceSchema(error)) console.error('Recurrence fetch error:', error);
      return;
    }
    if (!templates || !templates.length) return;

    let created = 0;
    for (const template of templates) {
      let parentId = template.id;
      let next = template.recurrence_next;
      const interval = template.recurrence_interval;
      const baseTitle = template.recurrence_base_title || template.title;
      let guard = 0;

      // One occurrence per elapsed period, capped so a long outage can't flood.
      while (interval && next && next <= today && guard < 60) {
        guard++;
        const periodDate = next;
        const newNext = addInterval(periodDate, interval);

        const occ = {
          title: occurrenceTitle(baseTitle, periodDate, interval),
          description: template.description,
          priority: template.priority || 'Medium',
          category: template.category || null,
          division: template.division || null,
          assigned_to: template.assigned_to || null,
          assigned_to_name: template.assigned_to_name || null,
          due_date: newNext,
          allotted_minutes: template.allotted_minutes || 0,
          status: 'Open',
          created_by: template.created_by || null,
          created_by_name: template.created_by_name || null,
          given_by: template.given_by || null,
          project_id: template.project_id || null,
          is_recurring: true,
          recurrence_interval: interval,
          recurrence_base_title: baseTitle,
          recurrence_next: newNext,
          created_at: getISTTime(),
          updated_at: getISTTime(),
          tagged_users: [],
          timeline: [
            {
              type: 'created',
              action: `Recurring task auto-created (${interval})`,
              user: 'System',
              created_at: getISTTime(),
            },
          ],
        };

        const { data: newTicket, error: insErr } = await supabase
          .from('tickets')
          .insert([occ])
          .select()
          .single();
        if (insErr) {
          console.error('Recurrence insert error:', insErr);
          break;
        }

        // Hand the spawner flag to the new occurrence. The parent keeps its
        // recurrence_interval/base_title so it still reads as part of the series.
        await supabase.from('tickets').update({ is_recurring: false }).eq('id', parentId);

        if (newTicket.assigned_to_name) {
          await notifyUser(
            newTicket.assigned_to_name,
            'Recurring Task Created',
            `A new recurring task "${newTicket.title}" is due ${newTicket.due_date}`,
            newTicket.id
          );
        }
        if (io) io.emit('ticketCreated', newTicket);

        parentId = newTicket.id;
        next = newNext;
        created++;
      }
    }

    if (created && io) io.emit('notificationReceived');
    if (created) console.log(`Recurrence: generated ${created} occurrence(s)`);
  } catch (err) {
    console.error('generateDueRecurrences error:', err);
  } finally {
    running = false;
  }
}

function startRecurrenceScheduler(io) {
  const run = () => generateDueRecurrences(io);
  setTimeout(run, 10000); // catch up shortly after boot (handles cold starts)
  setInterval(run, 60 * 60 * 1000).unref(); // then hourly while the server is warm
}

module.exports = { startRecurrenceScheduler, generateDueRecurrences };
