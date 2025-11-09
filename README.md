# ott-audience-map-web
A Machine Learning mini project using Node.js and Python for data clustering, analysis, and result visualization.


  ML Mini Project

This project is a   Machine Learning Mini Project   that combines a   Node.js backend  ,   Python data processing  , and a   frontend interface   for interactive data analysis and visualization. It allows users to upload CSV datasets, perform clustering using K-Means, and visualize the results dynamically.

---

   🚀 Features

- 📁 Upload CSV datasets from the web interface  
- 🧮 Python integration for K-Means clustering  
- 📊 Data scaling, PCA, and silhouette score analysis  
- 💾 Automatic result generation and downloadable cluster reports  
- 🌐 Express.js backend to handle API requests and connect with Python  
- 🎨 Simple and responsive frontend built with HTML, CSS, and JavaScript  

---

   🧠 Tech Stack

  Frontend:   HTML, CSS, JavaScript  
  Backend:   Node.js, Express.js  
  Machine Learning:   Python, scikit-learn, pandas, numpy  
  Visualization:   Matplotlib, PCA plots  
  Tools:   VS Code, Git, GitHub  

---

   ⚙️ How It Works

1. User uploads a `.csv` dataset through the web interface.  
2. The Node.js backend saves the file and triggers the Python script (`run_cluster.py`).  
3. The Python script processes the data, applies clustering (K-Means), and saves the results.  
4. Results and metrics are returned to the frontend for visualization or download.

---

   🧩 Folder Structure

ML-mini-project/
│
├── backend/ # Node.js server and routes
├── frontend/ # HTML, CSS, JS for UI
├── python/ # Python scripts for ML
├── data/ # Sample datasets
└── .gitignore

---



