package com.gadaviral.app

import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONObject

class ForgotPasswordActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (resources.displayMetrics.density * 22).toInt()
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(pad, pad * 2, pad, pad) }
        val title = TextView(this).apply {
            text = "Reset password"; textSize = 22f; setTextColor(0xFFF2A900.toInt()); gravity = Gravity.CENTER
        }
        val email = EditText(this).apply {
            hint = "Email address"; inputType = android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS; setSingleLine(true)
        }
        val send = Button(this).apply {
            text = "Send reset link"; setBackgroundColor(0xFFF2A900.toInt()); setTextColor(0xFF141414.toInt())
        }
        val status = TextView(this).apply { setTextColor(0xFF22C55E.toInt()); gravity = Gravity.CENTER; setPadding(0, 16, 0, 0) }
        root.addView(title)
        root.addView(email, LinearLayout.LayoutParams(-1, -2).apply { topMargin = 26 })
        root.addView(send, LinearLayout.LayoutParams(-1, -2).apply { topMargin = 24 })
        root.addView(status)
        setContentView(root)

        send.setOnClickListener {
            val em = email.text.toString().trim()
            if (em.isEmpty()) return@setOnClickListener
            send.isEnabled = false
            Thread {
                val res = Api.request("POST", "/auth/forgot-password", JSONObject().put("email", em))
                runOnUiThread {
                    send.isEnabled = true
                    when (res) {
                        is Api.Result.Ok -> status.text =
                            "If that account exists, a reset link from admin@gadaviral.com is on its way. Open it on this device."
                        is Api.Result.Fail -> { status.setTextColor(0xFFEF4444.toInt()); status.text = res.message }
                    }
                }
            }.start()
        }
    }
}
