import { useEffect, useState } from "react";

import {
  useNavigate,
  useParams,
} from "react-router-dom";

import MainLayout from "../layouts/MainLayout";

import api from "../services/api";

export default function EditTicket() {

  const { id } = useParams();

  const navigate = useNavigate();

  const [formData, setFormData] =
    useState({
      title: "",
      description: "",
      priority: "Medium",
      category: "",
      division: "",
      status: "Open",
      due_date: "",
    });

  useEffect(() => {

    fetchTicket();

  }, []);

  const fetchTicket =
    async () => {

      try {

        const res =
          await api.get(
            `/tickets/${id}`
          );

        setFormData(res.data);

      } catch (error) {

        console.log(error);

        alert(
          "Failed to load ticket"
        );
      }
    };

  const handleChange =
    (e) => {

      setFormData({
        ...formData,
        [e.target.name]:
          e.target.value,
      });
    };

  const handleSubmit =
    async (e) => {

      e.preventDefault();

      try {

        await api.put(
          `/tickets/${id}`,
          formData
        );

        alert(
          "Ticket updated successfully"
        );

        navigate("/tickets");

      } catch (error) {

        console.log(error);

        alert(
          "Update failed"
        );
      }
    };

  return (
    <MainLayout>

      <div className="bg-white p-8 rounded-2xl shadow-sm">

        <h1 className="text-3xl font-bold mb-8">
          Edit Ticket
        </h1>

        <form
          onSubmit={handleSubmit}
          className="space-y-5"
        >

          <input
            type="text"
            name="title"
            placeholder="Title"
            value={formData.title}
            onChange={handleChange}
            className="w-full border p-4 rounded-xl"
          />

          <textarea
            name="description"
            placeholder="Description"
            value={formData.description}
            onChange={handleChange}
            className="w-full border p-4 rounded-xl h-40"
          />

          <select
            name="priority"
            value={formData.priority}
            onChange={handleChange}
            className="w-full border p-4 rounded-xl"
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
          </select>

          <select
            name="status"
            value={formData.status}
            onChange={handleChange}
            className="w-full border p-4 rounded-xl"
          >
            <option>
              Open
            </option>

            <option>
              In Progress
            </option>

            <option>
              Waiting Approval
            </option>

            <option>
              Completed
            </option>
          </select>

          <input
            type="date"
            name="due_date"
            value={
              formData.due_date || ""
            }
            onChange={handleChange}
            className="w-full border p-4 rounded-xl"
          />

          <button
            type="submit"
            className="bg-black text-white px-6 py-4 rounded-xl"
          >
            Save Changes
          </button>

        </form>

      </div>

    </MainLayout>
  );
}