import {
  useEffect,
  useState,
} from "react";

import MainLayout from "../layouts/MainLayout";

import api from "../services/api";

import * as XLSX from "xlsx";

import { saveAs } from "file-saver";

export default function Reports() {
  const [tickets, setTickets] =
    useState([]);

const fetchTickets =
  async () => {
    try {
      const res =
        await api.get(
          "/tickets"
        );

      console.log(
        "TICKETS:",
        res.data
      );

      setTickets(res.data);
    } catch (error) {
      console.log(error);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const exportExcel =
    () => {
      const worksheet =
        XLSX.utils.json_to_sheet(
          tickets
        );

      const workbook =
        XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        "Reports"
      );

      const excelBuffer =
        XLSX.write(
          workbook,
          {
            bookType:
              "xlsx",
            type: "array",
          }
        );

      const fileData =
        new Blob(
          [excelBuffer],
          {
            type: "application/octet-stream",
          }
        );

      saveAs(
        fileData,
        "reports.xlsx"
      );
    };

  return (
    <MainLayout>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">
            Reports
          </h1>

          <p className="text-gray-500 mt-1">
            Enterprise reporting center
          </p>
        </div>

        <button
          onClick={
            exportExcel
          }
          className="bg-black text-white px-6 py-3 rounded-xl"
        >
          Export Excel
        </button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <ReportCard
          title="Monthly Report"
          value={
            tickets.length
          }
        />

        <ReportCard
          title="SLA Breaches"
          value="12"
        />

        <ReportCard
          title="Resolved"
          value={
            tickets.filter(
              (t) =>
                t.status ===
                "Resolved"
            ).length
          }
        />
      </div>
    </MainLayout>
  );
}

function ReportCard({
  title,
  value,
}) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm">
      <p className="text-gray-500">
        {title}
      </p>

      <h2 className="text-3xl font-bold mt-4">
        {value}
      </h2>
    </div>
  );
}