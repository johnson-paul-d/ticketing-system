import {
  useEffect,
  useState,
} from "react";

import MainLayout from "../layouts/MainLayout";

import api from "../services/api";

export default function AdminPanel() {
  const [users, setUsers] =
    useState([]);

  const [name, setName] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [role, setRole] =
    useState("User");

  const [division, setDivision] =
    useState("CPS");

const fetchUsers =
  async () => {
    try {
      const res =
        await api.get(
          "/users"
        );

      setUsers(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const createUser =
    async () => {
      await api.post(
        "/users",
        {
          name,
          email,
          password,
          role,
          division,
        }
      );

      fetchUsers();

      setName("");
      setEmail("");
      setPassword("");
    };

  const toggleUser =
    async (user) => {
      await api.put(
        `/users/${user.id}`,
        {
          active:
            !user.active,
        }
      );

      fetchUsers();
    };

  return (
    <MainLayout>
      <h1 className="text-3xl font-bold mb-8">
        Admin Panel
      </h1>

      {/* CREATE USER */}
      <div className="bg-white p-6 rounded-2xl shadow-sm mb-8">
        <h2 className="text-xl font-semibold mb-6">
          Create User
        </h2>

        <div className="grid grid-cols-2 gap-4">
          <input
            placeholder="Name"
            value={name}
            onChange={(e) =>
              setName(
                e.target.value
              )
            }
            className="border p-3 rounded-xl"
          />

          <input
            placeholder="Email"
            value={email}
            onChange={(e) =>
              setEmail(
                e.target.value
              )
            }
            className="border p-3 rounded-xl"
          />

          <input
            placeholder="Password"
            value={password}
            onChange={(e) =>
              setPassword(
                e.target.value
              )
            }
            className="border p-3 rounded-xl"
          />

          <select
            value={role}
            onChange={(e) =>
              setRole(
                e.target.value
              )
            }
            className="border p-3 rounded-xl"
          >
            <option>
              Admin
            </option>

            <option>
              Team Member
            </option>

            <option>
              User
            </option>
          </select>

          <select
            value={division}
            onChange={(e) =>
              setDivision(
                e.target.value
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
        </div>

        <button
          onClick={createUser}
          className="bg-black text-white px-6 py-3 rounded-xl mt-6"
        >
          Create User
        </button>
      </div>

      {/* USERS TABLE */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-5">
                Name
              </th>

              <th className="p-5">
                Email
              </th>

              <th className="p-5">
                Role
              </th>

              <th className="p-5">
                Division
              </th>

              <th className="p-5">
                Status
              </th>

              <th className="p-5">
                Activity
              </th>

              <th className="p-5">
                Action
              </th>
            </tr>
          </thead>

          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                className="border-t"
              >
                <td className="p-5">
                  {user.name}
                </td>

                <td className="p-5">
                  {user.email}
                </td>

                <td className="p-5">
                  {user.role}
                </td>

                <td className="p-5">
                  {user.division}
                </td>

                <td className="p-5">
                  {user.active
                    ? "Active"
                    : "Disabled"}
                </td>

                <td className="p-5">
                  {
                    user.activityCount
                  }
                </td>

                <td className="p-5">
                  <button
                    onClick={() =>
                      toggleUser(
                        user
                      )
                    }
                    className="bg-black text-white px-4 py-2 rounded-lg"
                  >
                    {user.active
                      ? "Disable"
                      : "Enable"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </MainLayout>
  );
}