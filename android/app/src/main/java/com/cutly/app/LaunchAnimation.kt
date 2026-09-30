package com.cutly.app

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.animation.PathInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import com.facebook.react.bridge.ReactMarker
import com.facebook.react.bridge.ReactMarkerConstants

/** Plays the opening animation immediately, before the JavaScript bundle is ready. */
class LaunchAnimation(private val activity: Activity) {
  private val overshoot = PathInterpolator(0.34f, 1.3f, 0.64f, 1f)
  private val exitEase = PathInterpolator(0.4f, 0f, 0.2f, 1f)
  private val overlay = FrameLayout(activity)
  private var contentReady = false
  private var introDone = false
  private var dismissed = false

  private val marker = ReactMarker.MarkerListener { name, _, _ ->
    if (name == ReactMarkerConstants.CONTENT_APPEARED) {
      activity.runOnUiThread {
        contentReady = true
        dismissIfReady()
      }
    }
  }

  fun show() {
    val teal = Color.parseColor("#0EC9A5")
    overlay.setBackgroundColor(teal)
    overlay.translationZ = 40f
    overlay.layoutParams = ViewGroup.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.MATCH_PARENT
    )

    val column = LinearLayout(activity).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
    }
    val icon = iconCard()
    val word = wordmark()
    val tagline = tagline()
    column.addView(icon, LinearLayout.LayoutParams(dp(134), dp(134)).apply { gravity = Gravity.CENTER_HORIZONTAL })
    column.addView(word, LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.WRAP_CONTENT,
      ViewGroup.LayoutParams.WRAP_CONTENT
    ).apply {
      topMargin = dp(28)
      gravity = Gravity.CENTER_HORIZONTAL
    })
    column.addView(tagline, LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.WRAP_CONTENT,
      ViewGroup.LayoutParams.WRAP_CONTENT
    ).apply {
      topMargin = dp(10)
      gravity = Gravity.CENTER_HORIZONTAL
    })
    overlay.addView(column, FrameLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.WRAP_CONTENT,
      Gravity.CENTER
    ))

    (activity.window.decorView as ViewGroup).addView(overlay)
    ReactMarker.addListener(marker)
    activity.window.statusBarColor = teal
    play(icon, word, tagline)
  }

  private fun iconCard(): FrameLayout {
    val card = FrameLayout(activity)
    card.background = GradientDrawable().apply {
      cornerRadius = dp(34).toFloat()
      setColor(Color.parseColor("#24FFFFFF"))
      setStroke(dp(1), Color.parseColor("#40FFFFFF"))
    }
    val blades = FrameLayout(activity)
    val top = blade(R.drawable.splash_blade_top, -18f)
    val bottom = blade(R.drawable.splash_blade_bottom, 18f)
    blades.addView(bottom)
    blades.addView(top)
    val screw = View(activity).apply {
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.parseColor("#E6FFFFFF"))
      }
    }
    card.addView(blades, FrameLayout.LayoutParams(dp(86), dp(58), Gravity.CENTER))
    card.addView(screw, FrameLayout.LayoutParams(dp(11), dp(11), Gravity.CENTER))
    card.scaleX = 0.55f
    card.scaleY = 0.55f
    card.alpha = 0f
    card.tag = top to bottom
    return card
  }

  private fun blade(drawable: Int, startRotation: Float): ImageView {
    return ImageView(activity).apply {
      setImageResource(drawable)
      scaleType = ImageView.ScaleType.FIT_XY
      layoutParams = FrameLayout.LayoutParams(dp(86), dp(58))
      rotation = startRotation
      pivotX = dp(47).toFloat()
      pivotY = dp(29).toFloat()
    }
  }

  private fun wordmark(): LinearLayout {
    val row = LinearLayout(activity).apply { orientation = LinearLayout.HORIZONTAL }
    val face = Typeface.createFromAsset(activity.assets, "fonts/Poppins-ExtraBold.ttf")
    "CutLy".forEach { char ->
      val letter = TextView(activity).apply {
        text = char.toString()
        setTextColor(Color.WHITE)
        textSize = 62.4f
        typeface = face
        alpha = 0f
        translationY = dp(14).toFloat()
      }
      row.addView(letter)
    }
    return row
  }

  private fun tagline(): TextView {
    val face = Typeface.createFromAsset(activity.assets, "fonts/Poppins-Medium.ttf")
    return TextView(activity).apply {
      text = "G R O O M I N G   M A D E   E A S Y"
      setTextColor(Color.parseColor("#8CFFFFFF"))
      textSize = 13.2f
      typeface = face
      alpha = 0f
      translationY = dp(8).toFloat()
    }
  }

  private fun play(icon: FrameLayout, word: LinearLayout, tagline: TextView) {
    val blades = icon.tag as Pair<*, *>
    val top = blades.first as ImageView
    val bottom = blades.second as ImageView
    val intro = AnimatorSet()
    intro.playTogether(
      sequence(icon, 100,
        ObjectAnimator.ofFloat(icon, View.ALPHA, 0f, 1f).apply { duration = 480 },
        ObjectAnimator.ofFloat(icon, View.SCALE_X, 0.55f, 1.05f).apply { duration = 480 },
        ObjectAnimator.ofFloat(icon, View.SCALE_Y, 0.55f, 1.05f).apply { duration = 480 }
      ),
      ObjectAnimator.ofFloat(icon, View.SCALE_X, 1.05f, 0.97f, 1f).apply { startDelay = 580; duration = 320; interpolator = overshoot },
      ObjectAnimator.ofFloat(icon, View.SCALE_Y, 1.05f, 0.97f, 1f).apply { startDelay = 580; duration = 320; interpolator = overshoot },
      ObjectAnimator.ofFloat(top, View.ROTATION, -18f, 5f, -2f, 0f).apply { startDelay = 550; duration = 700; interpolator = overshoot },
      ObjectAnimator.ofFloat(bottom, View.ROTATION, 18f, -5f, 2f, 0f).apply { startDelay = 550; duration = 700; interpolator = overshoot }
    )
    word.childCount.let { count ->
      for (index in 0 until count) {
        val letter = word.getChildAt(index)
        intro.playTogether(
          ObjectAnimator.ofFloat(letter, View.ALPHA, 0f, 1f).apply { startDelay = 720L + index * 70; duration = 360; interpolator = overshoot },
          ObjectAnimator.ofFloat(letter, View.TRANSLATION_Y, dp(14).toFloat(), -dp(3).toFloat(), 0f).apply { startDelay = 720L + index * 70; duration = 600; interpolator = overshoot }
        )
      }
    }
    intro.playTogether(
      ObjectAnimator.ofFloat(tagline, View.ALPHA, 0f, 1f).apply { startDelay = 1550; duration = 700 },
      ObjectAnimator.ofFloat(tagline, View.TRANSLATION_Y, dp(8).toFloat(), 0f).apply { startDelay = 1550; duration = 700 }
    )
    overlay.postDelayed({
      contentReady = true
      dismissIfReady()
    }, 8000)
    intro.addListener(object : AnimatorListenerAdapter() {
      override fun onAnimationEnd(animation: Animator) {
        introDone = true
        dismissIfReady()
      }
    })
    intro.start()
  }

  private fun sequence(target: View, delay: Long, vararg first: ObjectAnimator): AnimatorSet {
    first.forEach { it.startDelay = delay; it.interpolator = overshoot }
    return AnimatorSet().apply { playTogether(*first) }
  }

  private fun dismissIfReady() {
    if (!introDone || !contentReady || dismissed) return
    dismissed = true
    ReactMarker.removeListener(marker)
    overlay.animate().alpha(0f).scaleX(1.08f).scaleY(1.08f).setDuration(500).setInterpolator(exitEase)
      .withEndAction {
        (overlay.parent as? ViewGroup)?.removeView(overlay)
        activity.window.statusBarColor = Color.WHITE
      }
      .start()
  }

  private fun dp(value: Int): Int {
    return (value * activity.resources.displayMetrics.density).toInt()
  }
}
