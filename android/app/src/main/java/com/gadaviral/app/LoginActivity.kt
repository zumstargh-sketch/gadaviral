package com.gadaviral.app

import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject

class LoginActivity : AppCompatActivity() {
    private lateinit var email: EditText
    private lateinit var password: EditText
    private lateinit var loginBtn: Button
    private lateinit var status: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (resources.displayMetrics.density * 22).toInt()
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; setPadding(pad, pad * 2, pad, pad)
        }
        val brand = Branding.logoHeader(this)
        val sub = TextView(this).apply {
            text = "Dangme & Ga Online Social Community"; textSize = 12f
            setTextColor(0xFF9CA3AF.toInt()); gravity = Gravity.CENTER; setPadding(0, 6, 0, 0)
        }
        email = EditText(this).apply {
            hint = "Email address"; inputType = android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
            setSingleLine(true)
        }
        password = EditText(this).apply {
            hint = "Password"
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
            setSingleLine(true)
        }
        loginBtn = Button(this).apply {
            text = "Log in"; setBackgroundColor(0xFFF2A900.toInt()); setTextColor(0xFF141414.toInt())
        }
        val googleBtn = Button(this).apply { text = "Continue with Google" }
        val forgot = TextView(this).apply {
            text = "Forgot password?"; setTextColor(0xFFF2A900.toInt()); gravity = Gravity.CENTER; setPadding(0, 24, 0, 0)
        }
        val register = TextView(this).apply {
            text = "New here? Create an account"; setTextColor(0xFFF2A900.toInt())
            gravity = Gravity.CENTER; setPadding(0, 18, 0, 0)
        }
        status = TextView(this).apply {
            setTextColor(0xFFEF4444.toInt()); gravity = Gravity.CENTER; setPadding(0, 16, 0, 0)
        }
        root.addView(brand); root.addView(sub)
        // Seeded community members: bundled avatars instantly, then the real
        // seeded members' profile pictures from /community/highlights
        Branding.attachCommunity(this, root)
        root.addView(email)
        root.addView(password, LinearLayout.LayoutParams(-1, -2).apply { topMargin = 20 })
        root.addView(loginBtn, LinearLayout.LayoutParams(-1, -2).apply { topMargin = 30 })
        root.addView(googleBtn, LinearLayout.LayoutParams(-1, -2).apply { topMargin = 12 })
        root.addView(forgot); root.addView(register); root.addView(status)
        root.addView(Branding.madeBy(this))
        setContentView(root)
        loginBtn.setOnClickListener { doLogin() }
        register.setOnClickListener { startActivity(Intent(this, RegisterActivity::class.java)) }
        forgot.setOnClickListener { startActivity(Intent(this, ForgotPasswordActivity::class.java)) }
        googleBtn.setOnClickListener { startGoogleSignIn() }
    }

    private fun setBusy(b: Boolean) {
        loginBtn.isEnabled = !b
        loginBtn.text = if (b) "Logging in…" else "Log in"
        if (b) status.text = ""
    }

    private fun goToApp(ok: Api.Result.Ok) {
        Session.accessToken = ok.body.optString("accessToken")
        Session.refreshToken = ok.body.optString("refreshToken")
        Session.username = ok.body.optJSONObject("user")?.optString("username")
        startActivity(Intent(this, MainActivity::class.java)); finish()
    }

    private fun doLogin() {
        val em = email.text.toString().trim()
        val pw = password.text.toString()
        if (em.isEmpty() || pw.isEmpty()) { status.text = "Enter your email and password."; return }
        setBusy(true)
        Thread {
            val res = Api.request("POST", "/auth/login", JSONObject().put("email", em).put("password", pw))
            runOnUiThread {
                setBusy(false)
                when (res) {
                    is Api.Result.Ok -> goToApp(res)
                    is Api.Result.Fail -> status.text = res.message
                }
            }
        }.start()
    }
    // ── Genuine Google Sign-In: Google ID token → backend → GADAVIRAL session ──
    private fun startGoogleSignIn() {
        if (BuildConfig.GOOGLE_SERVER_CLIENT_ID.isBlank()) {
            status.text = "Google sign-in is not configured in this build (see android/README.md)."
            return
        }
        val gso = com.google.android.gms.auth.api.signin.GoogleSignInOptions.Builder(
            com.google.android.gms.auth.api.signin.GoogleSignInOptions.DEFAULT_SIGN_IN
        ).requestIdToken(BuildConfig.GOOGLE_SERVER_CLIENT_ID).requestEmail().build()
        val client = com.google.android.gms.auth.api.signin.GoogleSignIn.getClient(this, gso)
        startActivityForResult(client.signInIntent, RC_GOOGLE)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != RC_GOOGLE) return
        val task = com.google.android.gms.auth.api.signin.GoogleSignIn.getSignedInAccountFromIntent(data)
        val idToken = try { task.getResult(Exception::class.java)?.idToken } catch (_: Exception) { null }
        if (idToken == null) { status.text = "Google sign-in cancelled."; return }
        setBusy(true)
        Thread {
            val res = Api.request(
                "POST", "/auth/google/idtoken",
                JSONObject().put("idToken", idToken).put("platform", "ANDROID")
            )
            runOnUiThread {
                setBusy(false)
                when (res) {
                    is Api.Result.Ok -> goToApp(res)
                    is Api.Result.Fail -> status.text = res.message
                }
            }
        }.start()
    }

    companion object { private const val RC_GOOGLE = 9001 }
}

