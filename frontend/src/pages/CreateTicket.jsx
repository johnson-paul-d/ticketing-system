import { useState } from "react";
import { useNavigate } from "react-router-dom";

import MainLayout from "../layouts/MainLayout";
import api from "../services/api";

import useAuthStore from "../store/authStore";

export default function CreateTicket() {
  const navigate = useNavigate();

  const user = useAuthStore(
    (state) => state.user
  );

  // ===============================
  // STATES
  // ===============================
  const [title, setTitle] =
    useState("");

  const [
    description,
    setDescription,
  ] = useState("");

  const [priority, setPriority] =
    useState("Medium");

  const [category, setCategory] =
    useState("Hardware");

  const [division, setDivision] =
    useState("CPS");

  const [dueDate, setDueDate] =
    useState("");

  const [attachment, setAttachment] =
    useState(null);

  const [loading, setLoading] =
    useState(false);

  // ===============================
  // CREATE TICKET
  // ===============================
  const handleSubmit = async () => {
    try {
      setLoading(true);

      // VALIDATION
      if (!title.trim()) {
        alert(
          "Please enter ticket title"
        );

        return;
      }

      if (
        !description.trim()
      ) {
        alert(
          "Please enter description"
        );

        return;
      }

      const formData =
        new FormData();

      formData.append(
        "title",
        title
      );

      formData.append(
        "description",
        description
      );

      formData.append(
        "priority",
        priority
      );

      formData.append(
        "category",
        category
      );

      formData.append(
        "division",
        division
      );

      formData.append(
        "dueDate",
        dueDate
      );

      formData.append(
        "createdBy",
        user.email
      );

      formData.append(
        "createdByName",
        user.name
      );

      // FILE
      if (attachment) {
        formData.append(
          "attachment",
          attachment
        );
      }

      // API
      await api.post(
        "/tickets",
        formData,
        {
          headers: {
            "Content-Type":
              "multipart/form-data",
          },
        }
      );

      alert(
        "Ticket created successfully"
      );

      // RESET
      setTitle("");

      setDescription("");

      setPriority(
        "Medium"
      );

      setCategory(
        "Hardware"
      );

      setDivision("CPS");

      setDueDate("");

      setAttachment(null);

      // REDIRECT
      navigate("/tickets");
    } catch (error) {
      console.log(error);

      alert(
        "Failed to create ticket"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout>
      {/* HEADER */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">
          Create Ticket
        </h1>

        <p className="text-gray-500 mt-1">
          Submit a new support
          request
        </p>
      </div>

      {/* FORM */}
      <div className="bg-white rounded-2xl shadow-sm p-8 max-w-5xl">
        {/* TITLE */}
        <div className="mb-6">
          <label className="block mb-2 font-medium">
            Ticket Title
          </label>

          <input
            type="text"
            placeholder="Enter ticket title"
            className="w-full border p-4 rounded-xl"
            value={title}
            onChange={(e) =>
              setTitle(
                e.target.value
              )
            }
          />
        </div>

        {/* DESCRIPTION */}
        <div className="mb-6">
          <label className="block mb-2 font-medium">
            Description
          </label>

          <textarea
            rows="6"
            placeholder="Describe the issue..."
            className="w-full border p-4 rounded-xl"
            value={description}
            onChange={(e) =>
              setDescription(
                e.target.value
              )
            }
          ></textarea>
        </div>

        {/* CATEGORY + PRIORITY */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* CATEGORY */}
<div>
  <label className="block mb-2 font-medium">
    Category
  </label>

  <select
    className="w-full border p-4 rounded-xl"
    value={category}
    onChange={(e) =>
      setCategory(
        e.target.value
      )
    }
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

          {/* PRIORITY */}
          <div>
            <label className="block mb-2 font-medium">
              Priority
            </label>

            <select
              className="w-full border p-4 rounded-xl"
              value={priority}
              onChange={(e) =>
                setPriority(
                  e.target.value
                )
              }
            >
              <option>
                Low
              </option>

              <option>
                Medium
              </option>

              <option>
                High
              </option>

              <option>
                Critical
              </option>
            </select>
          </div>
        </div>

        {/* DIVISION + DUE DATE */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* DIVISION */}
         {/* DIVISION */}
<div>
  <label className="block mb-2 font-medium">
    Division
  </label>

  <select
    className="w-full border p-4 rounded-xl"
    value={division}
    onChange={(e) =>
      setDivision(
        e.target.value
      )
    }
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
</div>

          {/* DUE DATE */}
          <div>
            <label className="block mb-2 font-medium">
              Due Date
            </label>

            <input
              type="date"
              className="w-full border p-4 rounded-xl"
              value={dueDate}
              onChange={(e) =>
                setDueDate(
                  e.target.value
                )
              }
            />
          </div>
        </div>

        {/* ATTACHMENT */}
        <div className="mb-8">
          <label className="block mb-2 font-medium">
            Attachment
          </label>

          <input
            type="file"
            onChange={(e) =>
              setAttachment(
                e.target.files[0]
              )
            }
            className="w-full border p-4 rounded-xl bg-gray-50"
          />

          {attachment && (
            <p className="text-sm text-gray-500 mt-2">
              Selected:
              {" "}
              {
                attachment.name
              }
            </p>
          )}
        </div>

        {/* BUTTONS */}
        <div className="flex gap-4">
          <button
            onClick={
              handleSubmit
            }
            disabled={loading}
            className="bg-black text-white px-6 py-3 rounded-xl hover:bg-gray-800 disabled:opacity-50"
          >
            {loading
              ? "Creating..."
              : "Create Ticket"}
          </button>

          <button
            onClick={() =>
              navigate(
                "/tickets"
              )
            }
            className="border px-6 py-3 rounded-xl hover:bg-gray-100"
          >
            Cancel
          </button>
        </div>
      </div>
    </MainLayout>
  );
}