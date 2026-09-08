package com.gadaviral.app

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject

class VerifyActivity : AppCompatActivity() {
    private var cooldown = 0
    private lateinit var emailView: EditText
    private lateinit var otp: EditText
    private lateinit var verifyBtn: Button
    private lateinit var resend: Button
    private lateinit var status: TextView
    private val handler = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (resources.displayMetrics.density * 22).toInt()
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(pad, pad * 2, pad, pad) }
        val title = TextView(this).apply {
            text = "Verify your email 📧"; textSize = 22f; setTextColor(0xFFF2A900.toInt()); gravity = Gravity.CENTER
        }
        emailView = EditText(this).apply {
            hint = "Email address"; inputType = android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
            setText(intent.getStringExtra("email") ?: ""); setSingleLine(true)
        }
        otp = EditText(this).apply {
            hint = "6-digit code from your email"; inputType = android.text.InputType.TYPE_CLASS_NUMBER
            setSingleLine(true)
        }
        verifyBtn = Button(this).apply {
            text = "Verify my email"; setBackgroundColor(0xFFF2A900.toInt()); setTextColor(0xFF141414.toInt())
        }
        resend = Button(this).apply { text = "Resend code" }
        status = TextView(this).apply { setTextColor(0xFFEF4444.toInt()); gravity = Gravity.CENTER; setPadding(0, 14, 0, 0) }
        val note = TextView(this).apply {
            text = "Sent from GADAVIRAL (admin@gadaviral.com)"; textSize = 12f
            setTextColor(0xFF9CA3AF.toInt()); gravity = Gravity.CENTER; setPadding(0, 18, 0, 0)
        }
        root.addView(title)
        root.addView(emailView, LinearLayout.LayoutParams(-1, -2).apply { topMargin = 26 })
        root.addView(otp, LinearLayout.LayoutParams(-1, -2).apply { topMargin = 14 })
        root.addView(verifyBtn, LinearLayout.LayoutParams(-1, -2).apply { topMargin = 24 })
        root.addView(resend, LinearLayout.LayoutParams(-1, -2).apply { topMargin = 10 })
        root.addView(status); root.addView(note)
        setContentView(root)

        verifyBtn.setOnClickListener {
            val em = emailView.text.toString().trim()
            val code = otp.text.toString().trim()
            if (em.isEmpty() || code.length != 6) { status.text = "Enter your email and the 6-digit code."; return@setOnClickListener }
            verifyBtn.isEnabled = false
            Thread {
                val res = Api.request("POST", "/auth/verify-otp", JSONObject().put("email", em).put("otp", code))
                runOnUiThread {
                    verifyBtn.isEnabled = true
                    when (res) {
                        is Api.Result.Ok -> {
                            status.setTextColor(0xFF22C55E.toInt())
                            status.text = "Verified ✔ Redirecting to login…"
                            handler.postDelayed({ startActivity(Intent(this, LoginActivity::class.java)); finish() }, 1200)
                        }
                        is Api.Result.Fail -> status.text = res.message
                    }
                }
            }.start()
        }

        resend.setOnClickListener {
            val em = emailView.text.toString().trim()
            if (em.isEmpty() || cooldown > 0) return@setOnClickListener
            resend.isEnabled = false
            Thread {
                val res = Api.request("POST", "/auth/resend-verification", JSONObject().put("email", em))
                runOnUiThread {
                    when (res) {
                        is Api.Result.Ok -> status.text = "A new code is on its way."
                        is Api.Result.Fail -> status.text = res.message
                    }
                    cooldown = 60
                    resend.text = "Resend in 60s"
                    val tick = object : Runnable {
                        override fun run() {
                            cooldown -= 1
                            if (cooldown <= 0) { resend.isEnabled = true; resend.text = "Resend code" }
                            else { resend.text = "Resend in ${cooldown}s"; handler.postDelayed(this, 1000) }
                        }
                    }
                    handler.postDelayed(tick, 1000)
                }
            }.start()
        }
    }
}
