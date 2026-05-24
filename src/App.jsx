import { useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  AreaChart,
  Area,
  LineChart,
  Line,
} from "recharts";
import {
  Upload,
  FileText,
  BrainCircuit,
  Database,
  TrendingUp,
  Send,
  Bot,
  User,
  BarChart3,
  Sparkles,
  Activity,
  AlertTriangle,
  CheckCircle,
  Target,
} from "lucide-react";
import "./App.css";

function App() {
  const [fileName, setFileName] = useState("");
  const [data, setData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [numericColumn, setNumericColumn] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [healthCheck, setHealthCheck] = useState(null);
  const [loadingAI, setLoadingAI] = useState(false);

  const [chartLabelColumn, setChartLabelColumn] = useState("");
  const [chartValueColumn, setChartValueColumn] = useState("");
  const [chartType, setChartType] = useState("area");

  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState([
    {
      sender: "bot",
      text: "Upload dataset terlebih dahulu, lalu gunakan quick question untuk mulai analisis.",
    },
  ]);

  const normalizeText = (text) => String(text || "").toLowerCase().trim();

  const formatNumber = (number) =>
    Number(number || 0).toLocaleString("id-ID", {
      maximumFractionDigits: 2,
    });

  const detectNumericColumns = (rows, cols) =>
    cols.filter((col) =>
      rows.some((row) => {
        const value = row[col];
        return value !== "" && value !== null && !isNaN(Number(value));
      })
    );

  const findTextColumn = (cols) => {
    const keywords = [
      "product",
      "produk",
      "customer",
      "nama",
      "name",
      "employee",
      "karyawan",
      "category",
      "kategori",
      "status",
      "date",
    ];

    return (
      cols.find((col) =>
        keywords.some((keyword) => normalizeText(col).includes(keyword))
      ) ||
      cols[0] ||
      ""
    );
  };

  const detectDatasetType = (cols) => {
    const joined = cols.map((col) => normalizeText(col)).join(" ");

    const groups = [
      {
        type: "Sales / Transaction Data",
        label: "Sales",
        keywords: ["sales", "order", "amount", "revenue", "product", "customer", "category", "price", "transaction"],
      },
      {
        type: "Attendance / HR Data",
        label: "Attendance",
        keywords: ["attendance", "absen", "absensi", "employee", "karyawan", "status", "late", "present", "checkin", "checkout"],
      },
      {
        type: "Inventory / Stock Data",
        label: "Inventory",
        keywords: ["stock", "stok", "inventory", "qty", "quantity", "product", "warehouse", "supplier"],
      },
      {
        type: "Finance Data",
        label: "Finance",
        keywords: ["income", "expense", "profit", "loss", "salary", "gaji", "cost", "budget", "payment", "balance"],
      },
    ];

    const scored = groups.map((group) => ({
      ...group,
      score: group.keywords.filter((keyword) => joined.includes(keyword)).length,
    }));

    const best = scored.sort((a, b) => b.score - a.score)[0];

    if (!best || best.score === 0) {
      return { type: "General Dataset", label: "General", confidence: "Low" };
    }

    return {
      type: best.type,
      label: best.label,
      confidence: best.score >= 3 ? "High" : "Medium",
    };
  };

  const getColumnStats = (rows, col) => {
    const values = rows
      .map((row) => Number(row[col]))
      .filter((value) => !isNaN(value));

    if (values.length === 0) {
      return { total: 0, average: 0, min: 0, max: 0, maxIndex: -1, minIndex: -1 };
    }

    const total = values.reduce((sum, value) => sum + value, 0);
    const average = total / values.length;
    const max = Math.max(...values);
    const min = Math.min(...values);

    return {
      total,
      average,
      max,
      min,
      maxIndex: rows.findIndex((row) => Number(row[col]) === max),
      minIndex: rows.findIndex((row) => Number(row[col]) === min),
    };
  };

  const getMostFrequentValue = (rows, col) => {
    const counter = {};

    rows.forEach((row) => {
      const value = row[col];
      if (value !== undefined && value !== null && value !== "") {
        counter[value] = (counter[value] || 0) + 1;
      }
    });

    const entries = Object.entries(counter);
    if (entries.length === 0) return null;

    const [value, count] = entries.sort((a, b) => b[1] - a[1])[0];
    return { value, count };
  };

  const runHealthCheck = (rows, cols) => {
    let missingValues = 0;
    const emptyColumns = [];
    const invalidNumberColumns = [];
    const duplicateRows = new Set();
    const seenRows = new Set();

    cols.forEach((col) => {
      const values = rows.map((row) => row[col]);
      const emptyCount = values.filter(
        (value) => value === "" || value === null || value === undefined
      ).length;

      missingValues += emptyCount;

      if (emptyCount === rows.length) emptyColumns.push(col);

      const looksNumeric = values.some((value) => !isNaN(Number(value)) && value !== "");
      const invalidNumericCount = looksNumeric
        ? values.filter((value) => value !== "" && isNaN(Number(value))).length
        : 0;

      if (invalidNumericCount > 0) invalidNumberColumns.push(col);
    });

    rows.forEach((row, index) => {
      const key = JSON.stringify(row);
      if (seenRows.has(key)) duplicateRows.add(index);
      seenRows.add(key);
    });

    const score = Math.max(
      0,
      100 - missingValues * 2 - duplicateRows.size * 5 - emptyColumns.length * 10
    );

    return {
      score,
      missingValues,
      duplicateRows: duplicateRows.size,
      emptyColumns,
      invalidNumberColumns,
    };
  };

  const detectAnomalies = (rows, col) => {
    if (!col) return [];

    const stats = getColumnStats(rows, col);
    const threshold = stats.average * 2;

    return rows
      .map((row, index) => ({
        index,
        value: Number(row[col]),
        row,
      }))
      .filter((item) => item.value > threshold && item.value > 0)
      .slice(0, 3);
  };

  const generateSmartLocalInsight = (rows, cols, numericCol) => {
    setLoadingAI(true);

    setTimeout(() => {
      const datasetType = detectDatasetType(cols);
      const numericColumns = detectNumericColumns(rows, cols);
      const selectedNumericColumn = numericCol || numericColumns[0] || "";
      const textColumn = findTextColumn(cols);
      const stats = selectedNumericColumn ? getColumnStats(rows, selectedNumericColumn) : null;
      const frequentValue = textColumn ? getMostFrequentValue(rows, textColumn) : null;
      const anomalies = detectAnomalies(rows, selectedNumericColumn);

      const summary = [
        `Dataset terdeteksi sebagai ${datasetType.type}.`,
        `Confidence deteksi dataset: ${datasetType.confidence}.`,
        `Dataset memiliki ${formatNumber(rows.length)} baris dan ${formatNumber(cols.length)} kolom.`,
        numericColumns.length > 0
          ? `Kolom numerik yang terdeteksi: ${numericColumns.join(", ")}.`
          : "Belum ditemukan kolom numerik.",
      ];

      const insights = [];

      if (selectedNumericColumn && stats) {
        insights.push(`Kolom utama yang dianalisis adalah "${selectedNumericColumn}".`);
        insights.push(`Total nilai adalah ${formatNumber(stats.total)}.`);
        insights.push(`Rata-rata nilai adalah ${formatNumber(stats.average)}.`);
        insights.push(
          `Nilai tertinggi adalah ${formatNumber(stats.max)}, sedangkan nilai terendah adalah ${formatNumber(stats.min)}.`
        );
      }

      if (frequentValue) {
        insights.push(
          `Nilai paling sering pada kolom "${textColumn}" adalah "${frequentValue.value}" sebanyak ${frequentValue.count} kali.`
        );
      }

      if (anomalies.length > 0) {
        insights.push(
          `Terdapat ${anomalies.length} potensi anomaly karena nilainya jauh di atas rata-rata.`
        );
      }

      const recommendations = [
        "Gunakan chart control untuk memilih label dan value column yang paling relevan.",
        "Periksa health check sebelum membuat keputusan dari dataset.",
      ];

      if (datasetType.label === "Sales") {
        recommendations.unshift("Fokus pada produk, customer, atau kategori dengan nilai transaksi tertinggi.");
      } else if (datasetType.label === "Attendance") {
        recommendations.unshift("Periksa pola status kehadiran, keterlambatan, dan konsistensi absensi.");
      } else if (datasetType.label === "Inventory") {
        recommendations.unshift("Prioritaskan item dengan stok rendah dan pantau kebutuhan restock.");
      } else if (datasetType.label === "Finance") {
        recommendations.unshift("Pisahkan pemasukan dan pengeluaran agar evaluasi finansial lebih jelas.");
      }

      setAnalysis({
        status:
          "Analisis dibuat menggunakan Pseudo AI lokal berdasarkan statistik, struktur kolom, health check, dan anomaly detection sederhana.",
        datasetType,
        summary,
        insights,
        recommendations,
        anomalies,
      });

      setLoadingAI(false);
    }, 700);
  };

  const processData = (rows) => {
    const cleanRows = rows.filter((row) =>
      Object.values(row).some((value) => value !== "" && value !== null)
    );

    if (cleanRows.length === 0) {
      alert("File tidak memiliki data valid.");
      return;
    }

    const cols = Object.keys(cleanRows[0]);
    const numericColumns = detectNumericColumns(cleanRows, cols);
    const detectedNumericColumn = numericColumns[0] || "";
    const detectedLabelColumn = findTextColumn(cols);

    setColumns(cols);
    setData(cleanRows);
    setNumericColumn(detectedNumericColumn);
    setChartLabelColumn(detectedLabelColumn);
    setChartValueColumn(detectedNumericColumn);
    setHealthCheck(runHealthCheck(cleanRows, cols));
    setAnalysis(null);

    setMessages([
      {
        sender: "bot",
        text: "Dataset berhasil dibaca. Silakan gunakan quick question atau ketik pertanyaan sendiri.",
      },
    ]);

    generateSmartLocalInsight(cleanRows, cols, detectedNumericColumn);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);
    const ext = file.name.split(".").pop().toLowerCase();

    if (ext === "csv") {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => processData(result.data),
      });
    } else if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = (event) => {
        const workbook = XLSX.read(event.target.result, { type: "binary" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        processData(XLSX.utils.sheet_to_json(sheet));
      };
      reader.readAsBinaryString(file);
    } else {
      alert("Format file harus CSV, XLS, atau XLSX");
    }
  };

  const answerQuestion = (question) => {
    if (data.length === 0) return "Upload dataset terlebih dahulu sebelum bertanya.";

    const q = normalizeText(question);
    const datasetType = detectDatasetType(columns);
    const selectedNumeric = chartValueColumn || numericColumn;
    const selectedLabel = chartLabelColumn || findTextColumn(columns);
    const stats = selectedNumeric ? getColumnStats(data, selectedNumeric) : null;

    if (q.includes("rekomendasi") || q.includes("saran")) {
      return analysis?.recommendations?.join(" ") || "Rekomendasi belum tersedia.";
    }

    if (q.includes("health") || q.includes("kualitas") || q.includes("bersih")) {
      return `Data quality score: ${healthCheck?.score}/100. Missing values: ${healthCheck?.missingValues}. Duplicate rows: ${healthCheck?.duplicateRows}. Empty columns: ${healthCheck?.emptyColumns.length}.`;
    }

    if (q.includes("anomaly") || q.includes("anomali")) {
      return analysis?.anomalies?.length > 0
        ? `Ditemukan ${analysis.anomalies.length} potensi anomaly pada kolom "${selectedNumeric}". Nilainya jauh di atas rata-rata.`
        : "Belum ditemukan anomaly sederhana berdasarkan perbandingan dengan rata-rata.";
    }

    if (q.includes("jenis") || q.includes("tentang") || q.includes("dataset")) {
      return `Dataset ini terdeteksi sebagai ${datasetType.type} dengan confidence ${datasetType.confidence}.`;
    }

    if (q.includes("jumlah") || q.includes("berapa data") || q.includes("baris")) {
      return `Dataset memiliki ${formatNumber(data.length)} baris dan ${formatNumber(columns.length)} kolom.`;
    }

    if (q.includes("kolom")) {
      return `Kolom yang tersedia adalah: ${columns.join(", ")}.`;
    }

    if (q.includes("total")) {
      return selectedNumeric
        ? `Total nilai pada kolom "${selectedNumeric}" adalah ${formatNumber(stats.total)}.`
        : "Belum ada kolom angka yang bisa dihitung totalnya.";
    }

    if (q.includes("rata") || q.includes("average")) {
      return selectedNumeric
        ? `Rata-rata nilai pada kolom "${selectedNumeric}" adalah ${formatNumber(stats.average)}.`
        : "Belum ada kolom angka untuk menghitung rata-rata.";
    }

    if (q.includes("tertinggi") || q.includes("max")) {
      const label = data[stats.maxIndex]?.[selectedLabel] || `baris ke-${stats.maxIndex + 1}`;
      return selectedNumeric
        ? `Nilai tertinggi adalah ${formatNumber(stats.max)} pada "${label}" berdasarkan kolom "${selectedLabel}".`
        : "Belum ada kolom angka untuk mencari nilai tertinggi.";
    }

    if (q.includes("terendah") || q.includes("min")) {
      const label = data[stats.minIndex]?.[selectedLabel] || `baris ke-${stats.minIndex + 1}`;
      return selectedNumeric
        ? `Nilai terendah adalah ${formatNumber(stats.min)} pada "${label}" berdasarkan kolom "${selectedLabel}".`
        : "Belum ada kolom angka untuk mencari nilai terendah.";
    }

    if (q.includes("sering") || q.includes("terbanyak")) {
      const frequent = getMostFrequentValue(data, selectedLabel);
      return frequent
        ? `Nilai yang paling sering muncul pada kolom "${selectedLabel}" adalah "${frequent.value}" sebanyak ${frequent.count} kali.`
        : "Belum ditemukan nilai yang sering muncul.";
    }

    return "Saya bisa menjawab: total data, total nilai, rata-rata, nilai tertinggi, nilai terendah, jenis dataset, health check, anomaly, dan rekomendasi.";
  };

  const sendQuestion = (question) => {
    const botAnswer = answerQuestion(question);

    setMessages((prev) => [
      ...prev,
      { sender: "user", text: question },
      { sender: "bot", text: botAnswer },
    ]);
  };

  const handleSendMessage = () => {
    if (!chatInput.trim()) return;
    sendQuestion(chatInput.trim());
    setChatInput("");
  };

  const quickQuestions = [
    "Dataset ini tentang apa?",
    "Total data berapa?",
    "Total nilai berapa?",
    "Rata-rata berapa?",
    "Nilai tertinggi apa?",
    "Nilai terendah apa?",
    "Bagaimana kualitas data?",
    "Ada anomaly?",
    "Berikan rekomendasi",
  ];

  const activeValueColumn = chartValueColumn || numericColumn;
  const activeLabelColumn = chartLabelColumn || findTextColumn(columns);
  const numericColumns = detectNumericColumns(data, columns);

  const totalValue =
    activeValueColumn && data.length > 0
      ? data.reduce((sum, row) => sum + Number(row[activeValueColumn] || 0), 0)
      : 0;

  const stats = activeValueColumn ? getColumnStats(data, activeValueColumn) : null;
  const datasetTypeLabel = analysis?.datasetType?.type || "Waiting Dataset";

  const chartData = data.slice(0, 10).map((row, index) => ({
    name: row[activeLabelColumn] || `Data ${index + 1}`,
    value: Number(row[activeValueColumn]) || 0,
  }));

  const renderMainChart = () => {
    if (!activeValueColumn) return <p>Tidak ada kolom angka yang bisa dibuat grafik.</p>;

    if (chartType === "bar") {
      return (
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="value" radius={[10, 10, 0, 0]} fill="#2563eb" />
          </BarChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === "line") {
      return (
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={3} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      );
    }

    return (
      <ResponsiveContainer width="100%" height={350}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="valueGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#2563eb" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip />
          <Area type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={3} fill="url(#valueGradient)" />
        </AreaChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div className="app">
      <header className="hero">
        <div className="hero-content">
          <div className="hero-left">
            <p className="badge"><Sparkles size={14} /> Pseudo AI Data Analyst</p>
            <h1>Turn raw data into smart insights.</h1>
            <p className="subtitle">
              Upload CSV or Excel, detect dataset type, generate dynamic charts,
              run data health check, detect anomalies, and chat with your data.
            </p>
          </div>

          <div className="hero-panel">
            <div><span>Mode</span><b>No API Required</b></div>
            <div><span>Engine</span><b>Local Pseudo AI</b></div>
          </div>
        </div>
      </header>

      <main className="container">
        <section className="upload-card">
          <div className="upload-icon"><Upload size={34} /></div>
          <div>
            <h2>Upload Dataset</h2>
            <p>Support file CSV, XLS, dan XLSX.</p>
          </div>
          <label className="upload-btn">
            Choose File
            <input type="file" accept=".csv,.xls,.xlsx" onChange={handleFileUpload} hidden />
          </label>
          {fileName && <p className="file-name">File: {fileName}</p>}
        </section>

        {data.length > 0 && (
          <>
            <section className="stats-grid">
              <div className="stat-card"><FileText /><div><p>Total Rows</p><h3>{formatNumber(data.length)}</h3></div></div>
              <div className="stat-card"><Database /><div><p>Dataset Type</p><h3>{datasetTypeLabel}</h3></div></div>
              <div className="stat-card"><TrendingUp /><div><p>Total Value</p><h3>{formatNumber(totalValue)}</h3></div></div>
              <div className="stat-card"><Target /><div><p>Average</p><h3>{formatNumber(stats?.average || 0)}</h3></div></div>
            </section>

            <section className="health-grid">
              <div className="health-card">
                <CheckCircle />
                <div>
                  <p>Data Quality Score</p>
                  <h3>{healthCheck?.score || 0}/100</h3>
                </div>
              </div>
              <div className="health-card warning">
                <AlertTriangle />
                <div>
                  <p>Missing Values</p>
                  <h3>{healthCheck?.missingValues || 0}</h3>
                </div>
              </div>
              <div className="health-card">
                <Activity />
                <div>
                  <p>Duplicate Rows</p>
                  <h3>{healthCheck?.duplicateRows || 0}</h3>
                </div>
              </div>
            </section>

            <section className="card chart-card">
              <div className="chart-header">
                <div>
                  <h2>Smart Chart Dashboard</h2>
                  <p>Pilih kolom label, kolom angka, dan tipe chart sesuai kebutuhan analisis.</p>
                </div>
                <span className="chart-chip"><BarChart3 size={15} />{activeValueColumn}</span>
              </div>

              <div className="chart-controls">
                <div className="control-group">
                  <label>Label Column</label>
                  <select value={chartLabelColumn} onChange={(e) => setChartLabelColumn(e.target.value)}>
                    {columns.map((col) => <option key={col} value={col}>{col}</option>)}
                  </select>
                </div>

                <div className="control-group">
                  <label>Value Column</label>
                  <select value={chartValueColumn} onChange={(e) => setChartValueColumn(e.target.value)}>
                    {numericColumns.map((col) => <option key={col} value={col}>{col}</option>)}
                  </select>
                </div>

                <div className="control-group">
                  <label>Chart Type</label>
                  <select value={chartType} onChange={(e) => setChartType(e.target.value)}>
                    <option value="area">Area Chart</option>
                    <option value="bar">Bar Chart</option>
                    <option value="line">Line Chart</option>
                  </select>
                </div>
              </div>

              <div className="chart-wrapper">{renderMainChart()}</div>
            </section>

            <section className="content-grid">
              <div className="card insight-card">
                <div className="insight-header">
                  <div>
                    <h2>Insight Result</h2>
                    <p>Ringkasan analisis otomatis dari dataset.</p>
                  </div>
                  <span className="source-badge ai"><BrainCircuit size={15} /> Pseudo AI</span>
                </div>

                {loadingAI ? (
                  <div className="loading-box"><div className="loader"></div><p>Pseudo AI sedang menganalisis data...</p></div>
                ) : analysis ? (
                  <div className="analysis-wrapper">
                    <div className="status-box"><b>Status:</b> {analysis.status}</div>

                    <div className="mini-section">
                      <h3>Dataset Summary</h3>
                      <ul>{analysis.summary.map((item, i) => <li key={i}>{item}</li>)}</ul>
                    </div>

                    <div className="mini-section">
                      <h3>Key Insights</h3>
                      <ul>{analysis.insights.map((item, i) => <li key={i}>{item}</li>)}</ul>
                    </div>

                    <div className="mini-section">
                      <h3>Recommendations</h3>
                      <ul>{analysis.recommendations.map((item, i) => <li key={i}>{item}</li>)}</ul>
                    </div>
                  </div>
                ) : (
                  <p>Upload data untuk mendapatkan insight.</p>
                )}
              </div>

              <div className="card chat-card">
                <div className="chat-header">
                  <div>
                    <h2>Chat With Data</h2>
                    <p>Gunakan quick question atau ketik pertanyaan sendiri.</p>
                  </div>
                  <Bot />
                </div>

                <div className="quick-questions">
                  {quickQuestions.map((question) => (
                    <button key={question} onClick={() => sendQuestion(question)}>
                      {question}
                    </button>
                  ))}
                </div>

                <div className="chat-box">
                  {messages.map((message, index) => (
                    <div key={index} className={`chat-message ${message.sender === "user" ? "user" : "bot"}`}>
                      <div className="chat-avatar">
                        {message.sender === "user" ? <User size={16} /> : <Bot size={16} />}
                      </div>
                      <p>{message.text}</p>
                    </div>
                  ))}
                </div>

                <div className="chat-input">
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                    placeholder="Contoh: nilai tertinggi apa?"
                  />
                  <button onClick={handleSendMessage}><Send size={18} /></button>
                </div>
              </div>
            </section>

            <section className="card table-card">
              <h2>Data Preview</h2>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>{columns.map((col) => <th key={col}>{col}</th>)}</tr>
                  </thead>
                  <tbody>
                    {data.slice(0, 10).map((row, index) => (
                      <tr key={index}>{columns.map((col) => <td key={col}>{row[col]}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default App;