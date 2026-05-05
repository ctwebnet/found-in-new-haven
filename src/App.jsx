import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import {
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  addDoc as addDocLite,
  collection as collectionLite,
} from "firebase/firestore/lite";
import {
  getDownloadURL,
  ref,
  uploadBytesResumable,
} from "firebase/storage";
import { db, dbWrite, storage } from "./firebase";

const categories = [
  "Photos & Documents",
  "Architecture & Design",
  "Schools & Universities",
  "Businesses & Storefronts",
  "Music, Art & Culture",
  "Civic Life & Politics",
  "Neighborhood Life",
  "Transportation",
  "Manufacturing & Industry",
  "Personal Story",
  "Other",
];

const initialForm = {
  title: "",
  description: "",
  donorName: "",
  donorEmail: "",
  neighborhood: "",
  estimatedDate: "",
  category: categories[0],
};

function buildStorageFileName(fileName = "upload") {
  const cleanName = fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `${Date.now()}-${cleanName}`;
}

function withTimeout(promise, timeoutMs, timeoutMessage) {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (reason) => {
        window.clearTimeout(timeoutId);
        reject(reason);
      }
    );
  });
}

function getDonationCreatedAtMs(donation) {
  if (typeof donation.createdAtMs === "number") {
    return donation.createdAtMs;
  }

  if (donation.createdAt && typeof donation.createdAt.seconds === "number") {
    return donation.createdAt.seconds * 1000;
  }

  if (typeof donation.createdAt === "string") {
    const parsed = Date.parse(donation.createdAt);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

function Layout({ children }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/">
          Lost in New Haven Museum Donations
        </Link>
        <nav className="nav-links">
          <Link to="/submit">Submit</Link>
          <Link to="/review">Review</Link>
        </nav>
      </header>
      <main className="page">{children}</main>
    </div>
  );
}

function HomePage() {
  return (
    <Layout>
      <section className="hero">
        <p className="eyebrow">Community Memory Prototype</p>
        <h1>Lost in New Haven Museum Donations</h1>
        <p className="hero-copy">
          Help decide what New Haven remembers. Submit photos, objects,
          documents, and stories that capture the lost, overlooked, or everyday
          history of the city.
        </p>
        <div className="hero-actions">
          <Link className="button button-primary" to="/submit">
            Submit a Donation
          </Link>
          <Link className="button button-secondary" to="/review">
            Review Donations
          </Link>
        </div>
      </section>
    </Layout>
  );
}

function SubmitPage() {
  const [formData, setFormData] = useState(initialForm);
  const [photoFile, setPhotoFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitPhase, setSubmitPhase] = useState("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showSlowMessage, setShowSlowMessage] = useState(false);
  const fileInputRef = useRef(null);

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function handleFileChange(event) {
    const nextFile = event.target.files?.[0] ?? null;
    setPhotoFile(nextFile);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");
    setError("");
    setSubmitPhase(photoFile ? "uploading" : "saving");
    setUploadProgress(0);
    setShowSlowMessage(false);

    const slowMessageTimer = window.setTimeout(() => {
      setShowSlowMessage(true);
    }, 2500);

    try {
      let photoUrl = "";

      if (photoFile) {
        const storageRef = ref(
          storage,
          `donations/${buildStorageFileName(photoFile.name)}`
        );
        const uploadTask = uploadBytesResumable(storageRef, photoFile);

        const uploadResult = await new Promise((resolve, reject) => {
          uploadTask.on(
            "state_changed",
            (snapshot) => {
              const progress = Math.round(
                (snapshot.bytesTransferred / snapshot.totalBytes) * 100
              );
              setUploadProgress(progress);
            },
            reject,
            () => resolve(uploadTask.snapshot)
          );
        });

        setSubmitPhase("linking");
        photoUrl = await getDownloadURL(uploadResult.ref);
      }

      setSubmitPhase("saving");
      const createdAtMs = Date.now();
      const createdAt = new Date(createdAtMs);

      await withTimeout(
        addDocLite(collectionLite(dbWrite, "donations"), {
          ...formData,
          photoUrl,
          status: "new",
          reviewDecision: null,
          reviewNotes: "",
          createdAt,
          createdAtMs,
          reviewedAt: null,
        }),
        15000,
        "The donation record took too long to save. Please refresh and try again."
      );

      setFormData(initialForm);
      setPhotoFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setSubmitPhase("success");
      setUploadProgress(0);
      setShowSlowMessage(false);
      setMessage("Donation submitted successfully.");
    } catch (submitError) {
      setSubmitPhase("error");
      setError(
        submitError?.message || "Could not submit the donation. Please try again."
      );
      console.error(submitError);
    } finally {
      window.clearTimeout(slowMessageTimer);
      setIsSubmitting(false);
    }
  }

  return (
    <Layout>
      <section className="panel">
        <div className="section-heading">
          <p className="eyebrow">Donor Submission</p>
          <h2>Submit a potential museum donation</h2>
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Title
            <input
              name="title"
              value={formData.title}
              onChange={handleChange}
              required
            />
          </label>

          <label>
            Donor name
            <input
              name="donorName"
              value={formData.donorName}
              onChange={handleChange}
              required
            />
          </label>

          <label>
            Donor email
            <input
              name="donorEmail"
              type="email"
              value={formData.donorEmail}
              onChange={handleChange}
              required
            />
          </label>

          <label>
            Neighborhood
            <input
              name="neighborhood"
              value={formData.neighborhood}
              onChange={handleChange}
            />
          </label>

          <label>
            Estimated date
            <input
              name="estimatedDate"
              value={formData.estimatedDate}
              onChange={handleChange}
              placeholder="e.g. 1978 or Early 1900s"
            />
          </label>

          <label>
            Category
            <select
              name="category"
              value={formData.category}
              onChange={handleChange}
              required
            >
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <label className="full-width">
            Photo upload
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
            />
            <span className="field-hint">
              Upload a JPG, PNG, HEIC, or similar image file from your device.
            </span>
          </label>

          <label className="full-width">
            Description
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows="6"
              required
            />
          </label>

          <div className="full-width form-footer">
            {photoFile ? (
              <p className="message file-meta">Selected file: {photoFile.name}</p>
            ) : null}
            {isSubmitting && submitPhase === "uploading" ? (
              <p className="message file-meta">
                Uploading photo... {uploadProgress}%
              </p>
            ) : null}
            {isSubmitting && submitPhase === "saving" ? (
              <p className="message file-meta">
                Saving donation record...
              </p>
            ) : null}
            {isSubmitting && submitPhase === "linking" ? (
              <p className="message file-meta">
                Preparing the photo for your donation record...
              </p>
            ) : null}
            {isSubmitting && showSlowMessage ? (
              <p className="message file-meta">
                This can take a moment on the live site. Please keep this page open.
              </p>
            ) : null}
            <button
              className="button button-primary"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? submitPhase === "uploading"
                  ? "Uploading Photo..."
                  : submitPhase === "linking"
                    ? "Preparing Photo..."
                  : "Saving Donation..."
                : "Submit Donation"}
            </button>
            {message ? <p className="message success">{message}</p> : null}
            {error ? <p className="message error">{error}</p> : null}
          </div>
        </form>
      </section>
    </Layout>
  );
}

function ReviewPage() {
  const [donations, setDonations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    const donationsRef = collection(db, "donations");
    const reviewQuery = query(donationsRef, where("status", "==", "new"));

    const unsubscribe = onSnapshot(
      reviewQuery,
      (snapshot) => {
        const nextDonations = snapshot.docs
          .map((snapshotDoc) => ({
            id: snapshotDoc.id,
            ...snapshotDoc.data(),
          }))
          .sort(
            (left, right) =>
              getDonationCreatedAtMs(left) - getDonationCreatedAtMs(right)
          );
        setDonations(nextDonations);
        setIsLoading(false);
        setError("");
      },
      (snapshotError) => {
        console.error(snapshotError);
        setError(
          "Could not load donations. If Firestore asks for an index, create it and refresh."
        );
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const currentDonation = useMemo(() => donations[0] ?? null, [donations]);

  useEffect(() => {
    setImageFailed(false);
  }, [currentDonation?.id, currentDonation?.photoUrl]);

  async function handleDecision(decision) {
    if (!currentDonation) {
      return;
    }

    setIsReviewing(true);
    setError("");

    try {
      await updateDoc(doc(db, "donations", currentDonation.id), {
        status: decision,
        reviewDecision: decision,
        reviewedAt: new Date(),
      });
    } catch (reviewError) {
      console.error(reviewError);
      setError("Could not save that review decision. Please try again.");
    } finally {
      setIsReviewing(false);
    }
  }

  return (
    <Layout>
      <section className="review-shell">
        <div className="section-heading">
          <p className="eyebrow">Reviewer Queue</p>
          <h2>Review one donation at a time</h2>
        </div>

        {isLoading ? <div className="empty-state">Loading donations...</div> : null}
        {!isLoading && error ? <div className="empty-state error">{error}</div> : null}

        {!isLoading && !error && !currentDonation ? (
          <div className="empty-state">
            No new donations to review. Check back soon.
          </div>
        ) : null}

        {!isLoading && !error && currentDonation ? (
          <article className="review-card">
            {currentDonation.photoUrl && !imageFailed ? (
              <img
                className="review-image"
                src={currentDonation.photoUrl}
                alt={currentDonation.title}
                onError={() => setImageFailed(true)}
              />
            ) : (
              <div className="review-image review-image-placeholder">
                {currentDonation.photoUrl
                  ? "Photo could not be loaded"
                  : "No photo provided"}
              </div>
            )}

            <div className="review-content">
              <span className="pill">{currentDonation.category || "Uncategorized"}</span>
              <h3>{currentDonation.title}</h3>
              <p className="review-description">{currentDonation.description}</p>

              <dl className="detail-grid">
                <div>
                  <dt>Donor</dt>
                  <dd>{currentDonation.donorName || "Not provided"}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{currentDonation.donorEmail || "Not provided"}</dd>
                </div>
                <div>
                  <dt>Neighborhood</dt>
                  <dd>{currentDonation.neighborhood || "Not provided"}</dd>
                </div>
                <div>
                  <dt>Estimated date</dt>
                  <dd>{currentDonation.estimatedDate || "Not provided"}</dd>
                </div>
              </dl>

              <div className="decision-row">
                <button
                  className="button button-tertiary"
                  onClick={() => handleDecision("passed")}
                  disabled={isReviewing}
                  type="button"
                >
                  Pass
                </button>
                <button
                  className="button button-secondary"
                  onClick={() => handleDecision("maybe")}
                  disabled={isReviewing}
                  type="button"
                >
                  Maybe
                </button>
                <button
                  className="button button-primary"
                  onClick={() => handleDecision("accepted")}
                  disabled={isReviewing}
                  type="button"
                >
                  Accept
                </button>
              </div>
            </div>
          </article>
        ) : null}
      </section>
    </Layout>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/submit" element={<SubmitPage />} />
      <Route path="/review" element={<ReviewPage />} />
    </Routes>
  );
}
