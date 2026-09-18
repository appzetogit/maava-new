import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, Camera, Loader2, User } from "lucide-react"
import { userAPI } from "@food/api"
import { useProfile } from "../../context/ProfileContext"
import { Button, IconButton, toast } from "../index"
import "./profile.css"

/**
 * Edit Profile (presentation/profile/screens/edit_profile_screen.dart), with
 * the gaps closed: the photo uploads when picked and shows at once, the date
 * of birth starts from the saved one, only changed fields are sent, the phone
 * is read-only (the server refuses phone changes), and a failed save says so
 * instead of reporting success.
 */
const GENDERS = [
  ["", "Prefer not to choose"],
  ["male", "Male"],
  ["female", "Female"],
  ["other", "Other"],
  ["prefer-not-to-say", "Prefer not to say"],
]
const MAX_PHOTO = 5 * 1024 * 1024
const photoOf = (p) => {
  const v = p?.profileImage ?? p?.avatar
  return typeof v === "string" ? v : v?.url || ""
}
const dateInput = (v) => (v ? String(v).slice(0, 10) : "")

function remember(user) {
  try {
    const merged = { ...JSON.parse(localStorage.getItem("user_user") || "{}"), ...user }
    localStorage.setItem("user_user", JSON.stringify(merged))
    localStorage.setItem("userProfile", JSON.stringify(merged))
  } catch {
    /* storage blocked */
  }
}

export default function FoodEditProfile() {
  const navigate = useNavigate()
  const { userProfile, updateUserProfile } = useProfile()
  const initial = useRef(null)
  const [form, setForm] = useState({ name: "", email: "", dateOfBirth: "", gender: "" })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  // Start from the saved profile once it's loaded.
  useEffect(() => {
    if (!userProfile || initial.current) return
    const start = {
      name: userProfile.name || userProfile.fullName || "",
      email: userProfile.email || "",
      dateOfBirth: dateInput(userProfile.dateOfBirth),
      gender: userProfile.gender || "",
    }
    initial.current = start
    setForm(start)
  }, [userProfile])

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }))
    setErrors((er) => ({ ...er, [key]: undefined }))
  }
  const changed = initial.current ? Object.keys(form).filter((k) => form[k] !== initial.current[k]) : []
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate("/food/user/profile"))

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file (JPG, PNG or WEBP).")
      return
    }
    if (file.size > MAX_PHOTO) {
      toast.error("That photo is over 5 MB. Choose a smaller one.")
      return
    }
    setUploading(true)
    try {
      const res = await userAPI.uploadProfileImage(file)
      const body = res?.data?.data ?? res?.data ?? {}
      const profileImage = body.profileImage || body.user?.profileImage
      if (!profileImage) throw new Error("no image")
      updateUserProfile({ profileImage })
      remember({ profileImage })
      toast.success("Profile photo updated")
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not upload your photo. Please try again.")
    } finally {
      setUploading(false)
    }
  }

  const save = async (e) => {
    e.preventDefault()
    const found = {}
    if (!form.name.trim()) found.name = "Enter your name"
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) found.email = "Enter a valid email address"
    setErrors(found)
    if (Object.keys(found).length) return
    if (!changed.length) {
      back()
      return
    }
    const body = {}
    for (const k of changed) body[k] = k === "email" || k === "name" ? form[k].trim() : form[k]
    if (body.email === "") delete body.email // the server can't clear an email
    if (body.dateOfBirth === "") delete body.dateOfBirth
    setSaving(true)
    try {
      const res = await userAPI.updateProfile(body)
      const user = res?.data?.data?.user ?? res?.data?.user ?? body
      updateUserProfile(user)
      remember(user)
      toast.success("Profile updated")
      back()
    } catch (err) {
      toast.error(err?.response?.data?.message || "Could not update your profile. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const photo = photoOf(userProfile)
  return (
    <div className="fp fp--edit">
      <header className="fp-edithead">
        <IconButton label="Back" onClick={back}>
          <ArrowLeft />
        </IconButton>
        <div>
          <h1>Edit Profile</h1>
          <p>Update your profile information</p>
        </div>
      </header>

      <form className="fp-editform" onSubmit={save} noValidate>
        <div className="fp-editavatar">
          <button type="button" className="fp-avatar fp-avatar--lg" onClick={() => fileRef.current?.click()} disabled={uploading} aria-label="Change profile photo">
            {photo ? <img src={photo} alt="" /> : <User aria-hidden="true" />}
            <span className="fp-avatar__badge" aria-hidden="true">
              {uploading ? <Loader2 className="fp-spin" /> : <Camera />}
            </span>
          </button>
          <b>Change Profile Photo</b>
          <small>JPG, PNG or WEBP. Max size 5MB</small>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pickPhoto} />
        </div>

        <h2 className="fp-section">Personal Information</h2>
        <div className="fp-card fp-fields">
          <label className="fp-field">
            <span>Full Name</span>
            <input value={form.name} onChange={set("name")} autoComplete="name" aria-invalid={Boolean(errors.name)} />
            {errors.name && <em>{errors.name}</em>}
          </label>
          <label className="fp-field">
            <span>Mobile Number</span>
            <input value={userProfile?.phone || ""} readOnly aria-readonly="true" />
            <small>Your mobile number is how you sign in, so it can&apos;t be changed here.</small>
          </label>
          <label className="fp-field">
            <span>Email Address</span>
            <input type="email" value={form.email} onChange={set("email")} placeholder="name@example.com" autoComplete="email" aria-invalid={Boolean(errors.email)} />
            {errors.email && <em>{errors.email}</em>}
          </label>
          <label className="fp-field">
            <span>Date of Birth</span>
            <input type="date" value={form.dateOfBirth} onChange={set("dateOfBirth")} max={new Date().toISOString().slice(0, 10)} min="1920-01-01" />
          </label>
          <label className="fp-field">
            <span>Gender</span>
            <select value={form.gender} onChange={set("gender")}>
              {GENDERS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>

        <Button type="submit" loading={saving} disabled={saving || uploading}>
          Save Changes
        </Button>
      </form>
    </div>
  )
}
