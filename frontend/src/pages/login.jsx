import { useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../services/api";
import useAuthStore from "../store/authStore";

export default function Login() {
  const navigate = useNavigate();

  const login = useAuthStore(
    (state) => state.login
  );

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

const handleLogin = async () => {
  try {
    const res = await api.post('/auth/login', {
      email,
      password
    });

    localStorage.setItem(
      'token',
      res.data.token
    );

    login(res.data.user);

    navigate('/dashboard');
  } catch (error) {
    alert(
      error?.response?.data?.message ||
      'Invalid credentials'
    );
  }
};

      login(res.data.user);

      navigate("/dashboard");
    } catch (error) {
      alert("Invalid credentials");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-[400px]">
        <h1 className="text-3xl font-bold mb-2">
          Ticketing System
        </h1>

        <p className="text-gray-500 mb-6">
          Login to continue
        </p>

        <input
          type="email"
          placeholder="Email"
          className="w-full border p-3 rounded-xl mb-4"
          value={email}
          onChange={(e) =>
            setEmail(e.target.value)
          }
        />

        <input
          type="password"
          placeholder="Password"
          className="w-full border p-3 rounded-xl mb-6"
          value={password}
          onChange={(e) =>
            setPassword(e.target.value)
          }
        />

        <button
          onClick={handleLogin}
          className="w-full bg-black text-white p-3 rounded-xl"
        >
          Login
        </button>
      </div>
    </div>
  );
}