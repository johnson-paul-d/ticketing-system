// =====================================================
// Realtime audience helpers
// =====================================================
// Socket payloads used to go out over a bare io.emit(), which handed every
// connected client the full row and quietly bypassed the team scoping the REST
// layer enforces. Emits are addressed to rooms instead, using the same rule as
// canAccessTicket: team admins by team, everyone else by direct involvement.
//
// Room scheme (joined in server.js on connection):
//   user:<uuid>        every authenticated socket
//   team:<Marketing|Service>   admins only; Super Admin joins both

const { TEAM } = require('./roles');

const teamRoom = (team) => `team:${team}`;
const userRoom = (id) => `user:${id}`;

const ALL_TEAM_ROOMS = [teamRoom(TEAM.MARKETING), teamRoom(TEAM.SERVICE)];

/**
 * Emit to everyone allowed to see this record.
 *
 * @param {object|null} io
 * @param {string} event
 * @param {*} payload
 * @param {object} audience
 * @param {string|null} [audience.team]      team whose admins may see it
 * @param {boolean} [audience.allAdmins]     reach both teams' admins
 * @param {Array<string|null|undefined>} [audience.userIds]  directly involved users
 */
const emitScoped = (io, event, payload, { team, allAdmins = false, userIds = [] } = {}) => {
  if (!io) return;

  const rooms = [];
  if (allAdmins) rooms.push(...ALL_TEAM_ROOMS);
  else if (team) rooms.push(teamRoom(team));
  for (const id of userIds) if (id) rooms.push(userRoom(id));

  // No audience means nobody is entitled to it — stay silent rather than
  // falling back to a broadcast.
  if (!rooms.length) return;

  // socket.io de-duplicates a socket that matches more than one room.
  io.to([...new Set(rooms)]).emit(event, payload);
};

/** Emit to every admin on both teams (Super Admins included). */
const emitToAdmins = (io, event, payload) => {
  if (!io) return;
  io.to(ALL_TEAM_ROOMS).emit(event, payload);
};

/** Emit to one user, wherever they are connected. */
const emitToUser = (io, userId, event, payload) => {
  if (!io || !userId) return;
  io.to(userRoom(userId)).emit(event, payload);
};

module.exports = { emitScoped, emitToAdmins, emitToUser, teamRoom, userRoom };
