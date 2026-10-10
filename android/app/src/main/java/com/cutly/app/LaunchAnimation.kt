package com.cutly.app

import android.animation.Animator
import android.animation.ObjectAnimator
import android.app.Activity
import android.graphics.Color
import android.graphics.PorterDuff
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.PictureDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.animation.LinearInterpolator
import android.view.animation.PathInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.view.ViewCompat
import com.facebook.react.bridge.ReactMarker
import com.facebook.react.bridge.ReactMarkerConstants
import kotlin.concurrent.thread
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * ARCHIVED opening splash (SVG icon field + CutLy).
 * Opening beat is now JS PatternWavesSplash — see MainActivity.
 * Keep this class for later reuse; do not wire from MainActivity.
 */
class LaunchAnimation(private val activity: Activity) {
  private val scrollEase = PathInterpolator(0.12f, 0.82f, 0.24f, 1f)
  private val exitEase = PathInterpolator(0.4f, 0f, 0.2f, 1f)
  private val mainHandler = Handler(Looper.getMainLooper())
  private val overlay = FrameLayout(activity)
  private var scrollScale = 1f
  private var contentReady = false
  private var minHoldDone = false
  private var dismissed = false
  private var hierarchyListener: ViewGroup.OnHierarchyChangeListener? = null
  private var scrollAnimator: Animator? = null
  private val startedAt = android.os.SystemClock.uptimeMillis()

  companion object {
    /** Blinkit/Zomato-style: brief brand beat, then UI — not a 4s film. */
    private const val MIN_HOLD_MS = 420L
    private const val PAINT_SLACK_MS = 48L
    private const val FAILSAFE_MS = 8_000L
  }

  private val marker = ReactMarker.MarkerListener { name, _, _ ->
    if (name == ReactMarkerConstants.CONTENT_APPEARED) {
      activity.runOnUiThread {
        // Wait one beat for Layout coral bridge to paint under us.
        mainHandler.postDelayed({
          contentReady = true
          dismissIfReady()
        }, PAINT_SLACK_MS)
      }
    }
  }

  fun show(onOverlayReady: () -> Unit = {}) {
    val coral = Color.parseColor("#F06B55")
    overlay.setBackgroundColor(coral)
    overlay.layoutParams = ViewGroup.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.MATCH_PARENT
    )
    overlay.clipChildren = true
    overlay.isClickable = true
    overlay.isFocusable = true
    overlay.setOnTouchListener { _, _ -> true }
    raiseOverlay()

    // Empty field first — never block first paint on SVG parse.
    val iconField = iconFieldShell()
    overlay.addView(iconField)

    val column = LinearLayout(activity).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
    }
    val brandGlow = View(activity).apply {
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.parseColor("#1AFFFFFF"))
      }
      alpha = 0.45f
    }
    val word = wordmark()
    val divider = View(activity).apply {
      background = GradientDrawable().apply {
        cornerRadius = dp(1).toFloat()
        setColor(Color.parseColor("#D9FFFFFF"))
      }
    }
    val tagline = tagline()
    column.addView(word)
    column.addView(
      divider,
      LinearLayout.LayoutParams(dp(42), dp(2)).apply {
        topMargin = dp(10)
        gravity = Gravity.CENTER_HORIZONTAL
      }
    )
    column.addView(
      tagline,
      LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.WRAP_CONTENT,
        ViewGroup.LayoutParams.WRAP_CONTENT
      ).apply {
        topMargin = dp(10)
        gravity = Gravity.CENTER_HORIZONTAL
      }
    )

    val centerWrap = FrameLayout(activity)
    centerWrap.addView(
      brandGlow,
      FrameLayout.LayoutParams(dp(220), dp(220), Gravity.CENTER)
    )
    centerWrap.addView(
      column,
      FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.WRAP_CONTENT,
        ViewGroup.LayoutParams.WRAP_CONTENT,
        Gravity.CENTER
      )
    )

    // Soft clear-zone around brand: fade → solid → fade (vertically centered).
    addLogoExclusionFades(coral)

    overlay.addView(
      centerWrap,
      FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
      )
    )

    val footer = footerBar()
    overlay.addView(
      footer.root,
      FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT,
        Gravity.BOTTOM
      ).apply {
        bottomMargin = dp(64)
      }
    )

    val decor = activity.window.decorView as ViewGroup
    decor.addView(overlay)
    overlay.bringToFront()
    hierarchyListener = object : ViewGroup.OnHierarchyChangeListener {
      override fun onChildViewAdded(parent: View?, child: View?) {
        if (!dismissed && child !== overlay) raiseOverlay()
      }

      override fun onChildViewRemoved(parent: View?, child: View?) {}
    }
    decor.setOnHierarchyChangeListener(hierarchyListener)

    var released = false
    val release = {
      if (!released) {
        released = true
        onOverlayReady()
      }
    }
    overlay.viewTreeObserver.addOnPreDrawListener(object : android.view.ViewTreeObserver.OnPreDrawListener {
      override fun onPreDraw(): Boolean {
        overlay.viewTreeObserver.removeOnPreDrawListener(this)
        release()
        return true
      }
    })
    // Failsafe: never hold blank system splash if preDraw is late.
    mainHandler.postDelayed(release, 120)

    ReactMarker.addListener(marker)
    activity.window.statusBarColor = coral

    // Min hold; only dismiss after JS has appeared (never at a fixed 1.8s — that caused white).
    mainHandler.postDelayed({
      minHoldDone = true
      dismissIfReady()
    }, MIN_HOLD_MS)
    mainHandler.postDelayed({
      contentReady = true
      minHoldDone = true
      dismissIfReady()
    }, FAILSAFE_MS)

    playChrome(brandGlow, footer)
    // Defer SVG field so JS can start; cancel if we already dismissed.
    mainHandler.postDelayed({
      if (dismissed) return@postDelayed
      populateIconsAsync(iconField) {
        if (!dismissed) playScroll(iconField)
      }
    }, 80)
  }

  /** Symmetric soft hole around brand — no hard icon cutoffs. */
  private fun addLogoExclusionFades(coral: Int) {
    val screenH = activity.resources.displayMetrics.heightPixels
    val fadeH = (120f * scrollScale).roundToInt().coerceAtLeast(dp(70))
    val solidH = (200f * scrollScale).roundToInt().coerceAtLeast(dp(140))
    val bandTop = (screenH - (fadeH * 2 + solidH)) / 2

    val upper = View(activity).apply {
      background = GradientDrawable(
        GradientDrawable.Orientation.TOP_BOTTOM,
        intArrayOf(Color.TRANSPARENT, coral)
      )
    }
    val solid = View(activity).apply { setBackgroundColor(coral) }
    val lower = View(activity).apply {
      background = GradientDrawable(
        GradientDrawable.Orientation.TOP_BOTTOM,
        intArrayOf(coral, Color.TRANSPARENT)
      )
    }
    overlay.addView(
      upper,
      FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, fadeH).apply {
        topMargin = bandTop
      }
    )
    overlay.addView(
      solid,
      FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, solidH).apply {
        topMargin = bandTop + fadeH
      }
    )
    overlay.addView(
      lower,
      FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, fadeH).apply {
        topMargin = bandTop + fadeH + solidH
      }
    )
  }

  private fun iconFieldShell(): FrameLayout {
    val metrics = activity.resources.displayMetrics
    val screenW = metrics.widthPixels.toFloat()
    val screenH = metrics.heightPixels.toFloat()
    val designW = SplashFieldLayout.designWidth().toFloat()
    scrollScale = min(screenW / designW, screenH / 1280f)
    val offsetX = (screenW - designW * scrollScale) / 2f
    val offsetY = (screenH - 1280f * scrollScale) / 2f
    val fieldH = (SplashFieldLayout.fieldHeight() * scrollScale).toInt()

    return FrameLayout(activity).apply {
      layoutParams = FrameLayout.LayoutParams(
        (designW * scrollScale).toInt(),
        fieldH
      ).apply {
        leftMargin = offsetX.toInt()
        topMargin = offsetY.toInt()
      }
    }
  }

  private fun populateIconsAsync(field: FrameLayout, onReady: () -> Unit) {
    val assets = activity.assets
    val scale = scrollScale
    val iconSize = (56f * scale).toInt()
    thread(name = "cutly-splash-svg") {
      val cells = runCatching { SplashFieldLayout.load(assets) }.getOrElse { emptyList() }
      val prepared = ArrayList<Triple<Int, Int, PictureDrawable>>(cells.size)
      for (cell in cells) {
        val drawable = SplashSvgCache.drawable(assets, cell.file) ?: continue
        prepared.add(Triple(cell.l, cell.t, drawable))
      }
      mainHandler.post {
        if (dismissed) return@post
        for ((l, t, drawable) in prepared) {
          val icon = ImageView(activity).apply {
            setImageDrawable(drawable)
            scaleType = ImageView.ScaleType.FIT_CENTER
            alpha = 0.82f
            // Force cream/white line art even if an SVG still ships with black strokes.
            setColorFilter(Color.WHITE, PorterDuff.Mode.SRC_IN)
          }
          field.addView(
            icon,
            FrameLayout.LayoutParams(iconSize, iconSize).apply {
              leftMargin = (l * scale).toInt()
              topMargin = (t * scale).toInt()
            }
          )
        }
        onReady()
      }
    }
  }

  private fun wordmark(): LinearLayout {
    val row = LinearLayout(activity).apply { orientation = LinearLayout.HORIZONTAL }
    val face = Typeface.createFromAsset(activity.assets, "fonts/Poppins-ExtraBold.ttf")
    "CutLy".forEach { char ->
      val letter = TextView(activity).apply {
        text = char.toString()
        setTextColor(Color.WHITE)
        // ~30% larger than original 56sp for stronger brand on launch.
        textSize = 73f
        typeface = face
        alpha = 1f
        translationY = 0f
      }
      row.addView(letter)
    }
    return row
  }

  private fun tagline(): TextView {
    val face = Typeface.createFromAsset(activity.assets, "fonts/Poppins-Medium.ttf")
    return TextView(activity).apply {
      text = "G R O O M I N G   M A D E   E A S Y"
      setTextColor(Color.parseColor("#B8FFFFFF"))
      textSize = 12f
      typeface = face
      alpha = 0.85f
      translationY = 0f
    }
  }

  private data class Footer(val root: LinearLayout, val pulse: View, val trackFill: View, val status: TextView)

  private fun footerBar(): Footer {
    val root = LinearLayout(activity).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
    }
    val track = FrameLayout(activity).apply {
      background = GradientDrawable().apply {
        cornerRadius = dp(2).toFloat()
        setColor(Color.parseColor("#38FFFFFF"))
      }
    }
    val trackFill = View(activity).apply {
      background = GradientDrawable().apply {
        cornerRadius = dp(2).toFloat()
        setColor(Color.parseColor("#73FFFFFF"))
      }
      alpha = 0.45f
    }
    val pulse = View(activity).apply {
      background = GradientDrawable().apply {
        cornerRadius = dp(2).toFloat()
        setColor(Color.WHITE)
      }
      alpha = 0f
      translationX = dp(-33).toFloat()
    }
    track.addView(trackFill, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)))
    track.addView(pulse, FrameLayout.LayoutParams(dp(36), dp(3), Gravity.CENTER_VERTICAL))
    root.addView(track, LinearLayout.LayoutParams(dp(200), dp(3)))

    val status = TextView(activity).apply {
      text = "Preparing your experience"
      setTextColor(Color.parseColor("#17263C"))
      textSize = 13f
      alpha = 0.7f
      gravity = Gravity.CENTER
    }
    root.addView(
      status,
      LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.WRAP_CONTENT,
        ViewGroup.LayoutParams.WRAP_CONTENT
      ).apply { topMargin = dp(14) }
    )
    return Footer(root, pulse, trackFill, status)
  }

  private fun playChrome(brandGlow: View, footer: Footer) {
    val duration = 2400L
    ObjectAnimator.ofFloat(brandGlow, View.ALPHA, 0.45f, 1f, 0.75f, 0.45f).apply {
      this.duration = duration
      repeatCount = ObjectAnimator.INFINITE
      repeatMode = ObjectAnimator.RESTART
      start()
    }
    ObjectAnimator.ofFloat(footer.trackFill, View.ALPHA, 0.45f, 1f, 0.75f, 0.45f).apply {
      this.duration = duration
      repeatCount = ObjectAnimator.INFINITE
      repeatMode = ObjectAnimator.RESTART
      start()
    }
    ObjectAnimator.ofFloat(footer.pulse, View.ALPHA, 0f, 1f, 1f, 0f).apply {
      this.duration = duration
      repeatCount = ObjectAnimator.INFINITE
      repeatMode = ObjectAnimator.RESTART
      start()
    }
    ObjectAnimator.ofFloat(footer.pulse, View.TRANSLATION_X, dp(-33).toFloat(), dp(45).toFloat()).apply {
      this.duration = (duration * 0.85).toLong()
      startDelay = (duration * 0.0625).toLong()
      interpolator = LinearInterpolator()
      repeatCount = ObjectAnimator.INFINITE
      repeatMode = ObjectAnimator.RESTART
      start()
    }
    ObjectAnimator.ofFloat(footer.status, View.ALPHA, 0.7f, 1f).apply {
      this.duration = 360
      start()
    }
  }

  private fun playScroll(iconField: View) {
    val scroll = ObjectAnimator.ofFloat(iconField, View.TRANSLATION_Y, 0f, -980f * scrollScale).apply {
      duration = 2800L
      interpolator = scrollEase
    }
    scrollAnimator = scroll
    scroll.start()
  }

  private fun raiseOverlay() {
    overlay.bringToFront()
    ViewCompat.setElevation(overlay, 10000f)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
      overlay.translationZ = 10000f
    }
  }

  private fun dismissIfReady() {
    if (dismissed) return
    if (!minHoldDone || !contentReady) return
    dismissed = true
    scrollAnimator?.cancel()
    scrollAnimator = null
    (activity.window.decorView as? ViewGroup)?.setOnHierarchyChangeListener(null)
    hierarchyListener = null
    ReactMarker.removeListener(marker)
    overlay.animate().alpha(0f).scaleX(1.02f).scaleY(1.02f).setDuration(220).setInterpolator(exitEase)
      .withEndAction {
        (overlay.parent as? ViewGroup)?.removeView(overlay)
        // Hand off to cream home shell (matches JS bridge / home canvas).
        activity.window.statusBarColor = Color.parseColor("#F7F4EE")
        activity.window.decorView.setBackgroundColor(Color.parseColor("#F7F4EE"))
      }
      .start()
  }

  private fun dp(value: Int): Int {
    return (value * activity.resources.displayMetrics.density).toInt()
  }
}
