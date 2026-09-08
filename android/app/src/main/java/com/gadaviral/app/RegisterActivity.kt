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

class RegisterActivity : AppCompatActivity() {
    private lateinit var fullName: EditText
    private lateinit var email: EditText
    private lateinit var password: EditText
    private lateinit var username: EditText
    private lateinit var submit: Button
    private lateinit var status: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (resources.displayMetrics.density * 22).toInt()
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(pad, pad * 2, pad, pad) }
        // Official logo + wordmark, then the seeded-community member strip
        val title = Branding.logoHeader(this, 60f)
        val subtitle = TextView(this).apply {
            text = "Create your account"; textSize = 18f; setTextColor(0xFF9CA3AF.toInt()); gravity = Gravity.CENTER
        }
        fullName = EditText(this).apply { hint = "Full name (e.g. Nii Tetteh Quaye)"; setSingleLine(true) }
        email = EditText(this).apply {
            hint = "Email address"; inputType = android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS; setSingleLine(true)
        }
        password = EditText(this).apply {
            hint = "Password (min 8 characters)"
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
            setSingleLine(true)
        }
        username = EditText(this).apply { hint = "Username (optional)"; setSingleLine(true) }
        submit = Button(this).apply {
            text = "Create account"; setBackgroundColor(0xFFF2A900.toInt()); setTextColor(0xFF141414.toInt())
        }
        val back = TextView(this).apply {
            text = "← Back to login"; setTextColor(0xFFF2A900.toInt()); gravity = Gravity.CENTER; setPadding(0, 24, 0, 0)
        }
        status = TextView(this).apply { setTextColor(0xFFEF4444.toInt()); gravity = Gravity.CENTER; setPadding(0, 14, 0, 0) }

        root.addView(title)
        root.addView(subtitle)
        // Seeded community members: bundled avatars instantly, then the real
        // seeded members' profile pictures from /community/highlights
        Branding.attachCommunity(this, root)
        root.addView(fullName, LinearLayout.LayoutParams(-1, -2).apply { topMargin = 26 })
        root.addView(email, LinearLayout.LayoutParams(-1, -2).apply { topMargin = 14 })
        root.addView(password, LinearLayout.LayoutParams(-1, -2).apply { topMargin = 14 })
        root.addView(username, LinearLayout.LayoutParams(-1, -2).apply { topMargin = 14 })
        root.addView(submit, LinearLayout.LayoutParams(-1, -2).apply { topMargin = 26 })
        root.addView(back); root.addView(status)
        root.addView(Branding.madeBy(this))
        setContentView(root)

        submit.setOnClickListener {
            val em = email.text.toString().trim()
            val pw = password.text.toString()
            val fn = fullName.text.toString().trim()
            if (fn.isEmpty() || em.isEmpty() || pw.length < 8) {
                status.text = "Fill in all fields (password min 8 characters)."; return@setOnClickListener
            }
            submit.isEnabled = false; submit.text = "Creating…"
            val body = JSONObject().put("email", em).put("password", pw).put("fullName", fn)
            val un = username.text.toString().trim().lowercase()
            if (un.isNotEmpty()) body.put("username", un)
            Thread {
                val res = Api.request("POST", "/auth/register", body)
                runOnUiThread {
                    submit.isEnabled = true; submit.text = "Create account"
                    when (res) {
                        is Api.Result.Ok -> {
                            startActivity(
                                Intent(this, VerifyActivity::class.java)
                                    .putExtra("email", em)
                            )
                            finish()
                        }
                        is Api.Result.Fail -> status.text = res.message
                    }
                }
            }.start()
        }
        back.setOnClickListener { finish() }
    }
}
