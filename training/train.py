"""
CASTmir — train the Agent 2 Track 2 security classifier.

Normal class:  training/data/lmsys_features.parquet   (LMSYS-Chat-1M)
Attack class:  training/data/blackbasta_features.parquet (BlackBasta leak)

Target metrics (from the architecture doc): precision > 0.85 (minimize false
positives — don't alarm users unnecessarily), recall > 0.80 (catch most real
threats). See evaluate.py for the full report; this script prints a summary
and refuses to save a model that misses the precision bar, since a noisy
security feature is worse than none.
"""
import argparse
import pathlib

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, precision_score, recall_score
from sklearn.model_selection import train_test_split

from behavioral_features import FEATURE_COLUMNS


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--normal", default="data/lmsys_features.parquet")
    parser.add_argument("--attack", default="data/blackbasta_features.parquet")
    parser.add_argument("--out", default="../backend-py/security/models/classifier.pkl")
    parser.add_argument("--min-precision", type=float, default=0.85)
    args = parser.parse_args()

    normal = pd.read_parquet(args.normal)
    attack = pd.read_parquet(args.attack)
    print(f"normal: {len(normal):,} rows   attack: {len(attack):,} rows")

    data = pd.concat([normal, attack], ignore_index=True)
    X = data[FEATURE_COLUMNS]
    y = data["label"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=42,
    )

    clf = RandomForestClassifier(
        n_estimators=200, max_depth=12, class_weight="balanced", random_state=42,
    )
    clf.fit(X_train, y_train)

    y_pred = clf.predict(X_test)
    precision = precision_score(y_test, y_pred)
    recall = recall_score(y_test, y_pred)

    print()
    print(classification_report(y_test, y_pred, target_names=["normal", "attack"]))
    print(f"precision={precision:.3f} (target > {args.min_precision})   recall={recall:.3f} (target > 0.80)")

    importances = sorted(zip(FEATURE_COLUMNS, clf.feature_importances_), key=lambda x: -x[1])
    print("\nfeature importances:")
    for name, imp in importances:
        print(f"  {name:<24} {imp:.3f}")

    if precision < args.min_precision:
        print(f"\nREFUSING TO SAVE — precision {precision:.3f} is below the {args.min_precision} bar.")
        return

    out_path = pathlib.Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(clf, out_path)
    print(f"\nsaved to {out_path}")


if __name__ == "__main__":
    main()
