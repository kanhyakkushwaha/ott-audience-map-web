# python/run_cluster.py
import sys, os, json
import pandas as pd
import numpy as np
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score, davies_bouldin_score
from sklearn.decomposition import PCA

# usage: python3 run_cluster.py <run_id> <k> <scale>
if len(sys.argv) < 4:
    print("Usage: run_cluster.py <run_id> <k> <scale>", file=sys.stderr)
    sys.exit(2)

run_id = sys.argv[1]
k = int(sys.argv[2])
scale_flag = sys.argv[3].lower() in ['true', '1', 'yes']

RUNS_DIR = os.path.join('backend', 'runs')
input_csv = os.path.join(RUNS_DIR, f"{run_id}.csv")
out_csv = os.path.join(RUNS_DIR, f"{run_id}_with_clusters.csv")
out_json = os.path.join(RUNS_DIR, f"{run_id}_results.json")

if not os.path.exists(input_csv):
    print("Input CSV not found", file=sys.stderr)
    sys.exit(3)

try:
    df = pd.read_csv(input_csv)
    # basic preprocessing
    # preserve original columns and index
    original = df.copy()

    # choose features: numeric + simple encoding for categorical
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    # pick some categorical columns if present
    cat_cols = df.select_dtypes(include=['object']).columns.tolist()

    X_num = df[numeric_cols].fillna(0)

    # encode top 2 categorical columns (if present) using one-hot (to keep simple)
    X_cat = pd.DataFrame()
    if len(cat_cols) > 0:
        try:
            enc = OneHotEncoder(sparse=False, handle_unknown='ignore')
            X_cat_arr = enc.fit_transform(df[cat_cols].fillna('NA'))
            cat_names = []
            for i, c in enumerate(cat_cols):
                # approximate feature names by categories
                cats = enc.categories_[i]
                for cat in cats:
                    cat_names.append(f"{c}_{cat}")
            X_cat = pd.DataFrame(X_cat_arr, columns=cat_names)
        except Exception as e:
            X_cat = pd.DataFrame()

    # combine
    if not X_cat.empty:
        X = pd.concat([X_num.reset_index(drop=True), X_cat.reset_index(drop=True)], axis=1)
    else:
        X = X_num.copy()

    if X.shape[1] == 0:
        print("No features to cluster.", file=sys.stderr)
        sys.exit(4)

    # scaling
    if scale_flag:
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
    else:
        X_scaled = X.values

    # KMeans
    k = max(2, min(k, min(10, X_scaled.shape[0])))  # guard
    kmeans = KMeans(n_clusters=k, random_state=42, n_init='auto')
    labels = kmeans.fit_predict(X_scaled)

    # metrics
    try:
        sil = float(silhouette_score(X_scaled, labels)) if k > 1 and X_scaled.shape[0] > k else None
    except:
        sil = None
    try:
        db = float(davies_bouldin_score(X_scaled, labels)) if k > 1 and X_scaled.shape[0] > k else None
    except:
        db = None

    # PCA for visualization
    try:
        pca = PCA(n_components=2)
        pca_coords = pca.fit_transform(X_scaled)
    except Exception as e:
        pca_coords = np.zeros((X_scaled.shape[0], 2))

    df_out = original.copy()
    df_out['cluster'] = labels
    df_out['pca_x'] = pca_coords[:, 0]
    df_out['pca_y'] = pca_coords[:, 1]
    df_out.to_csv(out_csv, index=False)

    # cluster profiles: simple aggregations
    cluster_profiles = []
    for cluster_id in sorted(np.unique(labels)):
        idx = np.where(labels == cluster_id)[0]
        subset = df_out.iloc[idx]
        size = int(len(subset))
        # find most common OTT or cat if present
        top_ott = None
        if 'top_ott' in subset.columns:
            top_ott = subset['top_ott'].mode().iloc[0] if not subset['top_ott'].mode().empty else None
        # avg screen time if present
        avg_time = None
        if 'screen_time_hours' in subset.columns:
            avg_time = float(subset['screen_time_hours'].dropna().mean()) if subset['screen_time_hours'].dropna().shape[0] > 0 else None
        # genre
        top_genre = None
        if 'genre' in subset.columns:
            top_genre = subset['genre'].mode().iloc[0] if not subset['genre'].mode().empty else None

        cluster_profiles.append({
            "cluster": int(cluster_id),
            "size": size,
            "ott": top_ott,
            "genre": top_genre,
            "avg_time": avg_time
        })

    # build pca list with metadata
    pca_list = []
    for i, (x, y) in enumerate(pca_coords):
        meta = {}
        if 'id' in df_out.columns:
            meta['id'] = str(df_out.iloc[i]['id'])
        if 'top_ott' in df_out.columns:
            meta['ott'] = str(df_out.iloc[i]['top_ott'])
        if 'screen_time_hours' in df_out.columns:
            meta['screen_time'] = float(df_out.iloc[i]['screen_time_hours']) if pd.notnull(df_out.iloc[i]['screen_time_hours']) else None
        pca_list.append({ "x": float(x), "y": float(y), "cluster": int(labels[i]), **meta })

    result = {
        "labels": labels.tolist(),
        "silhouette": round(sil, 4) if sil is not None else None,
        "db_index": round(db, 4) if db is not None else None,
        "centroids": kmeans.cluster_centers_.tolist(),
        "pca": pca_list,
        "cluster_profiles": cluster_profiles,
        "n_rows": int(df_out.shape[0])
    }

    with open(out_json, 'w') as f:
        json.dump(result, f, indent=2)

    print("Completed", flush=True)
    sys.exit(0)

except Exception as e:
    print("Error during clustering: " + str(e), file=sys.stderr)
    sys.exit(5)
