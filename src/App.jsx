import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { addDoc as addDocLite, collection as collectionLite } from "firebase/firestore/lite";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
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

const reviewFilters = [
  { key: "new", label: "New Queue" },
  { key: "accepted", label: "Accepted" },
  { key: "maybe", label: "Maybe" },
  { key: "passed", label: "Passed" },
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

const adminPassword = import.meta.env.VITE_ADMIN_PASSWORD || "";
const adminSessionKey = "linh-admin-access";

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

function getDateMs(value) {
  if (!value) {
    return 0;
  }

  if (typeof value === "number") {
    return value;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value.seconds === "number") {
    return value.seconds * 1000;
  }

  if (typeof value.toDate === "function") {
    return value.toDate().getTime();
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

function getDonationCreatedAtMs(donation) {
  if (typeof donation.createdAtMs === "number") {
    return donation.createdAtMs;
  }

  return getDateMs(donation.createdAt);
}

function formatDate(value) {
  const dateMs = getDateMs(value);

  if (!dateMs) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(dateMs));
}

function Layout({ children }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-wrap">
          <Link className="brand" to="/">
            Lost in New Haven
          </Link>
          <span className="brand-subtitle">Museum Donations Review</span>
        </div>
        <nav className="nav-links">
          <Link to="/submit">Submit</Link>
          <Link to="/review">Admin Review</Link>
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
        <div className="hero-grid">
          <div>
            <p className="eyebrow">New Haven Museum Intake</p>
            <h1>Help shape what New Haven remembers.</h1>
            <p className="hero-copy">
              Share photographs, documents, objects, and personal histories that
              preserve the city&apos;s overlooked, everyday, and disappearing stories.
            </p>
            <p className="hero-copy hero-copy-secondary">
              Lost in New Haven is building a public-facing memory project with
              the New Haven Museum. Your submission helps the museum identify
              material worth preserving, researching, and sharing.
            </p>
            <div className="hero-actions">
              <Link className="button button-primary" to="/submit">
                Submit a Story or Object
              </Link>
              <Link className="button button-secondary" to="/review">
                Admin Review
              </Link>
            </div>
          </div>

          <aside className="hero-note">
            <p className="eyebrow">What to Submit</p>
            <ul className="hero-list">
              <li>Historic storefronts, schools, clubs, homes, and workplaces</li>
              <li>Photographs, flyers, letters, menus, signs, and ephemera</li>
              <li>Family memories and neighborhood stories tied to New Haven</li>
            </ul>
          </aside>
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

      await withTimeout(
        addDocLite(collectionLite(dbWrite, "donations"), {
          ...formData,
          photoUrl,
          status: "new",
          reviewDecision: null,
          reviewNotes: "",
          createdAt: new Date(createdAtMs),
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
      setMessage(
        "Thank you. Your submission has been received and will be reviewed by museum staff."
      );
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
          <p className="eyebrow">Community Submission</p>
          <h2>Share something the museum should consider preserving</h2>
          <p className="section-copy">
            Tell us what you have, where it comes from, and why it matters to
            New Haven. A staff reviewer will look at each submission individually.
          </p>
        </div>

        <form className="form-grid" onSubmit={handleSubmit}>
          <label>
            Title
            <input
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="Westville storefront photograph"
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
              placeholder="Fair Haven, Dixwell, Wooster Square..."
            />
          </label>

          <label>
            Estimated date
            <input
              name="estimatedDate"
              value={formData.estimatedDate}
              onChange={handleChange}
              placeholder="e.g. 1978 or early 1900s"
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
              A quick reference photo helps staff review the item. JPG, PNG, and
              HEIC are all fine for this MVP.
            </span>
          </label>

          <label className="full-width">
            Description
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows="6"
              placeholder="What is it? Who used it? Where was it found? Why does it matter?"
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
            {isSubmitting && submitPhase === "linking" ? (
              <p className="message file-meta">
                Preparing the photo for your donation record...
              </p>
            ) : null}
            {isSubmitting && submitPhase === "saving" ? (
              <p className="message file-meta">Saving donation record...</p>
            ) : null}
            {isSubmitting && showSlowMessage ? (
              <p className="message file-meta">
                This can take a moment on the live site. Please keep this page open.
              </p>
            ) : null}
            <button className="button button-primary" type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? submitPhase === "uploading"
                  ? "Uploading Photo..."
                  : submitPhase === "linking"
                    ? "Preparing Photo..."
                    : "Saving Donation..."
                : "Submit for Review"}
            </button>
            {message ? <p className="message success">{message}</p> : null}
            {error ? <p className="message error">{error}</p> : null}
          </div>
        </form>
      </section>
    </Layout>
  );
}

function AdminGate({ onAuthenticated }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(event) {
    event.preventDefault();

    if (!adminPassword) {
      setError(
        "Admin password is not configured yet. Add VITE_ADMIN_PASSWORD in your environment."
      );
      return;
    }

    if (password === adminPassword) {
      window.localStorage.setItem(adminSessionKey, "granted");
      onAuthenticated(true);
      return;
    }

    setError("That password was not recognized.");
  }

  return (
    <Layout>
      <section className="panel admin-gate">
        <div className="section-heading">
          <p className="eyebrow">Staff Access</p>
          <h2>Admin review is password protected</h2>
          <p className="section-copy">
            This lightweight gate is for MVP use only. Museum staff can unlock
            the review queue with the shared admin password.
          </p>
        </div>

        <form className="admin-form" onSubmit={handleSubmit}>
          <label>
            Admin password
            <input
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError("");
              }}
              required
            />
          </label>
          <button className="button button-primary" type="submit">
            Enter Review Console
          </button>
          {error ? <p className="message error">{error}</p> : null}
        </form>
      </section>
    </Layout>
  );
}

function ReviewPage() {
  const [isAuthed, setIsAuthed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return window.localStorage.getItem(adminSessionKey) === "granted";
  });
  const [activeFilter, setActiveFilter] = useState("new");
  const [donations, setDonations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(0);

  useEffect(() => {
    if (!isAuthed) {
      return undefined;
    }

    setIsLoading(true);
    setError("");
    setHistoryIndex(0);

    const donationsRef = collection(db, "donations");
    const reviewQuery = query(donationsRef, where("status", "==", activeFilter));

    const unsubscribe = onSnapshot(
      reviewQuery,
      (snapshot) => {
        const nextDonations = snapshot.docs
          .map((snapshotDoc) => ({
            id: snapshotDoc.id,
            ...snapshotDoc.data(),
          }))
          .sort((left, right) => {
            if (activeFilter === "new") {
              return getDonationCreatedAtMs(left) - getDonationCreatedAtMs(right);
            }

            return getDateMs(right.reviewedAt) - getDateMs(left.reviewedAt);
          });

        setDonations(nextDonations);
        setIsLoading(false);
      },
      (snapshotError) => {
        console.error(snapshotError);
        setError("Could not load donations. Please refresh and try again.");
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [activeFilter, isAuthed]);

  const currentDonation = useMemo(() => {
    if (activeFilter === "new") {
      return donations[0] ?? null;
    }

    return donations[historyIndex] ?? null;
  }, [activeFilter, donations, historyIndex]);

  useEffect(() => {
    setImageFailed(false);
  }, [currentDonation?.id, currentDonation?.photoUrl]);

  useEffect(() => {
    if (historyIndex > donations.length - 1) {
      setHistoryIndex(0);
    }
  }, [donations.length, historyIndex]);

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

  function handleLogout() {
    window.localStorage.removeItem(adminSessionKey);
    setIsAuthed(false);
  }

  if (!isAuthed) {
    return <AdminGate onAuthenticated={setIsAuthed} />;
  }

  return (
    <Layout>
      <section className="review-shell">
        <div className="review-toolbar">
          <div className="section-heading">
            <p className="eyebrow">Museum Review Console</p>
            <h2>Assess new donations and browse past decisions</h2>
            <p className="section-copy">
              Staff can triage incoming submissions, then move through accepted,
              maybe, and passed items by filter.
            </p>
          </div>
          <button className="button button-tertiary" onClick={handleLogout} type="button">
            Lock Review
          </button>
        </div>

        <div className="filter-row">
          {reviewFilters.map((filter) => (
            <button
              key={filter.key}
              className={`filter-pill ${activeFilter === filter.key ? "is-active" : ""}`}
              onClick={() => setActiveFilter(filter.key)}
              type="button"
            >
              {filter.label}
            </button>
          ))}
        </div>

        {isLoading ? <div className="empty-state">Loading donations...</div> : null}
        {!isLoading && error ? <div className="empty-state error">{error}</div> : null}

        {!isLoading && !error && !currentDonation ? (
          <div className="empty-state">
            {activeFilter === "new"
              ? "No new donations to review. Check back soon."
              : `No ${activeFilter} donations to show yet.`}
          </div>
        ) : null}

        {!isLoading && !error && currentDonation ? (
          <>
            {activeFilter !== "new" ? (
              <div className="history-header">
                <span className="message file-meta">
                  Viewing {historyIndex + 1} of {donations.length}
                </span>
                <div className="history-actions">
                  <button
                    className="button button-tertiary"
                    disabled={historyIndex === 0}
                    onClick={() => setHistoryIndex((current) => Math.max(current - 1, 0))}
                    type="button"
                  >
                    Previous
                  </button>
                  <button
                    className="button button-tertiary"
                    disabled={historyIndex >= donations.length - 1}
                    onClick={() =>
                      setHistoryIndex((current) =>
                        Math.min(current + 1, donations.length - 1)
                      )
                    }
                    type="button"
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}

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
                  {currentDonation.photoUrl ? "Photo could not be loaded" : "No photo provided"}
                </div>
              )}

              <div className="review-content">
                <div className="pill-row">
                  <span className="pill">{currentDonation.category || "Uncategorized"}</span>
                  {activeFilter !== "new" ? (
                    <span className={`status-pill status-${currentDonation.status}`}>
                      {currentDonation.status}
                    </span>
                  ) : null}
                </div>
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
                  <div>
                    <dt>Submitted</dt>
                    <dd>{formatDate(currentDonation.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>Reviewed</dt>
                    <dd>
                      {currentDonation.reviewedAt
                        ? formatDate(currentDonation.reviewedAt)
                        : "Not reviewed yet"}
                    </dd>
                  </div>
                </dl>

                {activeFilter === "new" ? (
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
                ) : (
                  <p className="history-note">
                    This item was marked <strong>{currentDonation.status}</strong> and is being
                    shown from the reviewed archive.
                  </p>
                )}
              </div>
            </article>
          </>
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
