import { useEffect, useState } from "react";

import { useParams } from "react-router-dom";

import MainLayout from "../layouts/MainLayout";

import api from "../services/api";

import useAuthStore from "../store/authStore";

export default function TicketDetails() {
  const { id } = useParams();

  const user = useAuthStore(
    (state) => state.user
  );

  const [ticket, setTicket] =
    useState(null);

  const [teamMembers, setTeamMembers] =
    useState([]);

  const [selectedMember, setSelectedMember] =
    useState("");

  const [editedDueDate, setEditedDueDate] =
    useState("");

  const [editedDivision, setEditedDivision] =
    useState("");

  const [comment, setComment] =
    useState("");

  const [attachment, setAttachment] =
    useState(null);

  // =========================
  // FETCH TICKET
  // =========================
  const fetchTicket = async () => {
    try {
      const res = await api.get(
        `/tickets/${id}`
      );

      setTicket(res.data);

      setEditedDueDate(
        res.data.dueDate || ""
      );

      setEditedDivision(
        res.data.division || "CPS"
      );
    } catch (error) {
      console.log(error);
    }
  };

  // =========================
  // FETCH TEAM MEMBERS
  // =========================
  const fetchTeamMembers =
    async () => {
      try {
        const res =
          await api.get(
            "/auth/team-members"
          );

        setTeamMembers(
          res.data
        );
      } catch (error) {
        console.log(error);
      }
    };

  useEffect(() => {
    fetchTicket();

    fetchTeamMembers();
  }, []);

  // =========================
  // UPDATE STATUS
  // =========================
  const updateStatus =
    async (status) => {
      try {
        await api.put(
          `/tickets/${id}`,
          {
            status,

            changedBy:
              user.name,

            role:
              user.role,
          }
        );

        fetchTicket();
      } catch (error) {
        console.log(error);

        alert(
          error?.response?.data
            ?.message ||
            "Failed to update status"
        );
      }
    };

  // =========================
  // ASSIGN TICKET
  // =========================
  const assignTicket =
    async (assigned) => {
      try {
        await api.put(
          `/tickets/${id}`,
          {
            assigned,

            changedBy:
              user.name,

            role:
              user.role,
          }
        );

        fetchTicket();

        setSelectedMember("");
      } catch (error) {
        console.log(error);
      }
    };

  // =========================
  // UPDATE DUE DATE
  // =========================
  const updateDueDate =
    async () => {
      try {
        await api.put(
          `/tickets/${id}`,
          {
            dueDate:
              editedDueDate,

            changedBy:
              user.name,

            role:
              user.role,
          }
        );

        fetchTicket();

        alert(
          "Due date updated"
        );
      } catch (error) {
        console.log(error);

        alert(
          "Failed to update due date"
        );
      }
    };

  // =========================
  // UPDATE DIVISION
  // =========================
  const updateDivision =
    async () => {
      try {
        await api.put(
          `/tickets/${id}`,
          {
            division:
              editedDivision,

            changedBy:
              user.name,

            role:
              user.role,
          }
        );

        fetchTicket();

        alert(
          "Division updated"
        );
      } catch (error) {
        console.log(error);

        alert(
          "Failed to update division"
        );
      }
    };

  // =========================
  // ADD COMMENT
  // =========================
  const addComment =
    async () => {
      if (
        !comment.trim()
      )
        return;

      try {
        await api.post(
          `/tickets/${id}/comment`,
          {
            user:
              user.name,

            role:
              user.role,

            message:
              comment,
          }
        );

        setComment("");

        fetchTicket();
      } catch (error) {
        console.log(error);

        alert(
          "Failed to add comment"
        );
      }
    };

      // =========================
  // DELETE TICKET
  // =========================
  const deleteTicket =
    async () => {

      const confirmDelete =
        window.confirm(
          "Are you sure you want to delete this ticket?"
        );

      if (!confirmDelete)
        return;

      try {

        await api.delete(
          `/tickets/${id}`,
          {
            data: {
              deletedBy:
                user.name,

              role:
                user.role,
            },
          }
        );

        alert(
          "Ticket deleted successfully"
        );

        window.location.href =
          "/tickets";

      } catch (error) {

        console.log(error);

        alert(
          "Failed to delete ticket"
        );
      }
    };

  // =========================
  // UPLOAD ATTACHMENT
  // =========================
  const uploadAttachment =
    async () => {
      if (!attachment) {
        alert(
          "Please select file"
        );

        return;
      }

      try {
        const formData =
          new FormData();

        formData.append(
          "attachment",
          attachment
        );

        formData.append(
          "changedBy",
          user.name
        );

        formData.append(
          "role",
          user.role
        );

        await api.put(
          `/tickets/${id}/attachment`,
          formData,
          {
            headers: {
              "Content-Type":
                "multipart/form-data",
            },
          }
        );

        alert(
          "Attachment uploaded"
        );

        setAttachment(
          null
        );

        fetchTicket();
      } catch (error) {
        console.log(error);

        alert(
          "Upload failed"
        );
      }
    };

  if (!ticket) {
    return (
      <MainLayout>
        <p>Loading...</p>
      </MainLayout>
    );
  }

  // =========================
  // HISTORY
  // =========================
  let history = [];

  try {
    history = JSON.parse(
      ticket.history || "[]"
    );
  } catch {
    history = [];
  }

  // =========================
  // COMMENTS
  // =========================
  let comments = [];

  try {
    comments = JSON.parse(
      ticket.comments || "[]"
    );
  } catch {
    comments = [];
  }

  // =========================
  // DUE DATE HISTORY
  // =========================
  let dueDateHistory = [];

  try {
    dueDateHistory = JSON.parse(
      ticket.dueDateHistory || "[]"
    );
  } catch {
    dueDateHistory = [];
  }

  return (
    <MainLayout>
      <div className="bg-white rounded-2xl shadow-sm p-8">
        {/* HEADER */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold">
              {ticket.title}
            </h1>

            <p className="text-gray-500 mt-2">
              Ticket ID:
              {" "}
              {ticket.id}
            </p>
          </div>

          <span
            className={`px-4 py-2 rounded-full ${
              ticket.status ===
              "Completed"
                ? "bg-green-100 text-green-700"
                : ticket.status ===
                  "Waiting For Approval"
                ? "bg-orange-100 text-orange-700"
                : ticket.status ===
                  "In Progress"
                ? "bg-blue-100 text-blue-700"
                : "bg-yellow-100 text-yellow-700"
            }`}
          >
            {ticket.status}
          </span>
        </div>

        {/* DETAILS */}
        <div className="grid grid-cols-2 gap-10">
          {/* LEFT */}
          <div className="space-y-6">
            <div>
              <h2 className="font-semibold mb-2">
                Description
              </h2>

              <p className="text-gray-700">
                {
                  ticket.description
                }
              </p>
            </div>

            <div>
              <h2 className="font-semibold mb-2">
                Priority
              </h2>

              <p>
                {ticket.priority}
              </p>
            </div>

            {/* CATEGORY */}
            <div>
              <h2 className="font-semibold mb-2">
                Category
              </h2>

              <select
                value={
                  ticket.category
                }
                onChange={async (
                  e
                ) => {
                  try {
                    await api.put(
                      `/tickets/${id}`,
                      {
                        category:
                          e.target
                            .value,

                        changedBy:
                          user.name,

                        role:
                          user.role,
                      }
                    );

                    fetchTicket();

                    alert(
                      "Category updated"
                    );
                  } catch (error) {
                    console.log(
                      error
                    );

                    alert(
                      "Failed to update category"
                    );
                  }
                }}
                className="border p-3 rounded-xl w-full"
              >
                <option>
                  Exhibition
                </option>

                <option>
                  Salesforce
                </option>

                <option>
                  BPV
                </option>

                <option>
                  Linkedin Content
                </option>

                <option>
                  Collateral
                </option>

                <option>
                  Lead Generation
                </option>

                <option>
                  Strategy
                </option>

                <option>
                  Others
                </option>

                <option>
                  Advertisement
                </option>

                <option>
                  Video
                </option>

                <option>
                  Email Campaign
                </option>

                <option>
                  Graphic Design
                </option>

                <option>
                  Linkedin Post
                </option>

                <option>
                  Website
                </option>

                <option>
                  Reports
                </option>

                <option>
                  Branding
                </option>
              </select>
            </div>

            {/* DIVISION */}
            <div>
              <h2 className="font-semibold mb-2">
                Division
              </h2>

              <div className="flex gap-3">
                <select
                  value={
                    editedDivision
                  }
                  onChange={(e) =>
                    setEditedDivision(
                      e.target
                        .value
                    )
                  }
                  className="border p-3 rounded-xl"
                >
                  <option>
                    CPS
                  </option>

                  <option>
                    TMD
                  </option>

                  <option>
                    ASTOR
                  </option>

                  <option>
                    All User
                  </option>
                </select>

                <button
                  onClick={
                    updateDivision
                  }
                  className="bg-black text-white px-5 rounded-xl"
                >
                  Update
                </button>
              </div>
            </div>

            {/* DUE DATE */}
            <div>
              <h2 className="font-semibold mb-2">
                Due Date
              </h2>

              <div className="flex gap-3 items-center">
                <input
                  type="date"
                  value={
                    editedDueDate
                  }
                  onChange={(
                    e
                  ) =>
                    setEditedDueDate(
                      e.target
                        .value
                    )
                  }
                  className="border p-3 rounded-xl"
                />

                <button
                  onClick={
                    updateDueDate
                  }
                  className="bg-black text-white px-4 py-3 rounded-xl"
                >
                  Update
                </button>
              </div>
            </div>

            {/* ATTACHMENT */}
            <div>
              <h2 className="font-semibold mb-2">
                Attachment
              </h2>

              {ticket.attachment ? (
                <a
                  href={`http://localhost:5000/uploads/${ticket.attachment}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 underline block mb-4"
                >
                  View Current Attachment
                </a>
              ) : (
                <p className="mb-4">
                  No attachment
                </p>
              )}

              <div className="flex gap-3 items-center">
                <input
                  type="file"
                  onChange={(
                    e
                  ) =>
                    setAttachment(
                      e.target
                        .files[0]
                    )
                  }
                  className="border p-3 rounded-xl"
                />

                <button
                  onClick={
                    uploadAttachment
                  }
                  className="bg-black text-white px-5 py-3 rounded-xl"
                >
                  Upload
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT */}
          <div className="space-y-6">
            <div>
              <h2 className="font-semibold mb-2">
                Assigned To
              </h2>

              <p>
                {ticket.assigned}
              </p>
            </div>

            <div>
              <h2 className="font-semibold mb-2">
                Created By
              </h2>

              <p>
                {
                  ticket.createdByName
                }
              </p>

              <p className="text-gray-500 text-sm">
                {
                  ticket.createdBy
                }
              </p>
            </div>

            <div>
              <h2 className="font-semibold mb-2">
                Current Status
              </h2>

              <p>
                {ticket.status}
              </p>
            </div>

            <div>
              <h2 className="font-semibold mb-2">
                Created At
              </h2>

              <p>
                {ticket.createdAt ||
                  "Not Available"}
              </p>
            </div>

            <div>
              <h2 className="font-semibold mb-2">
                Last Updated
              </h2>

              <p>
                {ticket.updatedAt ||
                  "Not Available"}
              </p>
            </div>

            <div>
              <h2 className="font-semibold mb-2">
                Resolved At
              </h2>

              <p>
                {ticket.resolvedAt ||
                  "Not Resolved"}
              </p>
            </div>
          </div>
        </div>

        {/* ASSIGNMENT */}
        {user?.role ===
          "Admin" && (
          <div className="mt-10 border-t pt-8">
            <h2 className="text-xl font-semibold mb-4">
              Assign Ticket
            </h2>

            <div className="flex gap-4 items-center">
              <select
                value={
                  selectedMember
                }
                onChange={(
                  e
                ) =>
                  setSelectedMember(
                    e.target
                      .value
                  )
                }
                className="border p-3 rounded-xl min-w-[250px]"
              >
                <option value="">
                  Select Team Member
                </option>

                {teamMembers.map(
                  (
                    member
                  ) => (
                    <option
                      key={
                        member.id
                      }
                      value={
                        member.name
                      }
                    >
                      {
                        member.name
                      }
                    </option>
                  )
                )}
              </select>

              <button
                onClick={() =>
                  assignTicket(
                    selectedMember
                  )
                }
                className="bg-black text-white px-5 py-3 rounded-xl"
              >
                Assign
              </button>

              <button
                onClick={() =>
                  assignTicket(
                    "Unassigned"
                  )
                }
                className="border px-5 py-3 rounded-xl"
              >
                Unassign
              </button>
            </div>
          </div>
        )}

        {/* COMMENTS */}
        <div className="mt-10 border-t pt-8">
          <h2 className="text-xl font-semibold mb-6">
            Comments &
            Discussion
          </h2>

          <div className="space-y-4 mb-6">
            {comments.length >
            0 ? (
              comments
                .slice()
                .reverse()
                .map(
                  (
                    item,
                    index
                  ) => (
                    <div
                      key={index}
                      className="bg-gray-50 rounded-xl p-4"
                    >
                      <div className="flex justify-between mb-2">
                        <div>
                          <span className="font-semibold">
                            {
                              item.user
                            }
                          </span>

                          <span className="text-sm text-gray-500 ml-2">
                            (
                            {
                              item.role
                            }
                            )
                          </span>
                        </div>

                        <span className="text-sm text-gray-400">
                          {
                            item.time
                          }
                        </span>
                      </div>

                      <p className="text-gray-700">
                        {
                          item.message
                        }
                      </p>
                    </div>
                  )
                )
            ) : (
              <p className="text-gray-500">
                No comments yet
              </p>
            )}
          </div>

          <div className="space-y-4">
            <textarea
              rows="4"
              value={comment}
              onChange={(e) =>
                setComment(
                  e.target.value
                )
              }
              placeholder="Write a comment..."
              className="w-full border p-4 rounded-xl"
            ></textarea>

            <button
              onClick={
                addComment
              }
              className="bg-black text-white px-6 py-3 rounded-xl"
            >
              Add Comment
            </button>
          </div>
        </div>

        {/* GENERAL HISTORY */}
        <div className="mt-10 border-t pt-8">
          <h2 className="text-xl font-semibold mb-6">
            Activity Timeline
          </h2>

          <div className="space-y-4">
            {history
              .filter(
                (item) =>
                  item.field !==
                  "dueDate"
              )
              .slice()
              .reverse()
              .map(
                (
                  item,
                  index
                ) => (
                  <div
                    key={index}
                    className="border rounded-xl p-4 bg-white"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-gray-800">
                          {
                            item.action
                          }
                        </p>

                        {item.oldValue && (
                          <p className="text-sm text-gray-500 mt-2">
                            <span className="font-medium">
                              Old:
                            </span>
                            {" "}
                            {
                              item.oldValue
                            }

                            {" "}
                            →

                            {" "}

                            <span className="font-medium">
                              New:
                            </span>
                            {" "}
                            {
                              item.newValue
                            }
                          </p>
                        )}
                      </div>

                      <span className="text-xs text-gray-400">
                        {item.time}
                      </span>
                    </div>

                    <div className="mt-3 text-sm text-gray-500">
                      Changed By:
                      {" "}
                      {
                        item.changedBy
                      }
                    </div>
                  </div>
                )
              )}
          </div>
        </div>

        {/* DUE DATE HISTORY */}
        <div className="mt-10 border-t pt-8">
          <h2 className="text-xl font-semibold mb-6">
            Due Date Change
            History
          </h2>

          <div className="space-y-4">
            {dueDateHistory
              .slice()
              .reverse()
              .map(
                (
                  item,
                  index
                ) => (
                  <div
                    key={index}
                    className="bg-orange-50 border border-orange-200 rounded-xl p-5"
                  >
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="font-semibold text-orange-700">
                        Due Date Updated
                      </h3>

                      <span className="text-xs text-gray-500">
                        {item.time}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="bg-white rounded-lg p-3 border">
                        <p className="text-xs text-gray-500 mb-1">
                          OLD DATE
                        </p>

                        <p className="font-semibold text-red-600">
                          {item.oldDate ||
                            "Empty"}
                        </p>
                      </div>

                      <div className="bg-white rounded-lg p-3 border">
                        <p className="text-xs text-gray-500 mb-1">
                          NEW DATE
                        </p>

                        <p className="font-semibold text-green-600">
                          {
                            item.newDate
                          }
                        </p>
                      </div>
                    </div>

                    <div className="text-sm text-gray-600">
                      Changed By:
                      {" "}
                      <span className="font-medium">
                        {
                          item.changedBy
                        }
                      </span>
                    </div>
                  </div>
                )
              )}
          </div>
        </div>

        {/* STATUS */}
        <div className="mt-10 border-t pt-8">
          <h2 className="text-xl font-semibold mb-4">
            Update Status
          </h2>

          <div className="flex flex-wrap gap-4">
            <button
              onClick={() =>
                updateStatus(
                  "Open"
                )
              }
              className="bg-yellow-500 text-white px-5 py-3 rounded-xl"
            >
              Open
            </button>

            <button
              onClick={() =>
                updateStatus(
                  "In Progress"
                )
              }
              className="bg-blue-500 text-white px-5 py-3 rounded-xl"
            >
              In Progress
            </button>

            {ticket.status !==
              "Completed" && (
              <button
                onClick={() =>
                  updateStatus(
                    "Resolved"
                  )
                }
                className="bg-green-600 text-white px-5 py-3 rounded-xl"
              >
                Resolve
              </button>
            )}

            {user?.role ===
              "Admin" &&
              ticket.status ===
                "Waiting For Approval" && (
                <>
                  <button
                    onClick={() =>
                      updateStatus(
                        "Completed"
                      )
                    }
                    className="bg-green-700 text-white px-5 py-3 rounded-xl"
                  >
                    Approve &
                    Complete
                  </button>

                  <button
                    onClick={() =>
                      updateStatus(
                        "In Progress"
                      )
                    }
                    className="bg-red-600 text-white px-5 py-3 rounded-xl"
                  >
                    Reject
                  </button>
                </>
              )}
              {/* DELETE */}
{user?.role ===
  "Admin" && (
  <button
    onClick={deleteTicket}
    className="bg-red-700 hover:bg-red-800 text-white px-5 py-3 rounded-xl"
  >
    Delete Ticket
  </button>
)}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}