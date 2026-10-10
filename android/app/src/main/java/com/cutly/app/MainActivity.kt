package com.cutly.app

import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView

import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper
import expo.modules.splashscreen.SplashScreenManager

/**
 * Launch bridge must match JS BootPatternBeat exactly:
 * pattern cover + wordmark at true screen center, width = 72% of screen.
 */
class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    val splashScreen = installSplashScreen()
    splashScreen.setOnExitAnimationListener { provider -> provider.remove() }
    setTheme(R.style.AppTheme)

    window.decorView.setBackgroundColor(CORAL)
    super.onCreate(null)

    SplashScreenManager.hide()
    attachLaunchBridge()

    // Last-resort only — signed-in JS dismisses after home paints. Do not cut early
    // (early dismiss = blank coral, then a second still looks like “first animation twice”).
    Handler(Looper.getMainLooper()).postDelayed({ dismissLaunchBridge() }, 12000L)
  }

  private fun attachLaunchBridge() {
    if (launchBridge != null) return

    val frame = FrameLayout(this).apply {
      setBackgroundColor(CORAL)
      layoutParams = FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
      )
      elevation = 100f
      isClickable = true
    }

    val pattern = ImageView(this).apply {
      setImageResource(R.drawable.splash_pattern_waves)
      scaleType = ImageView.ScaleType.CENTER_CROP
      layoutParams = FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
      )
    }

    // Same math as JS: width * 0.72, aspect 243/706, Gravity.CENTER
    val screenW = resources.displayMetrics.widthPixels
    val logoW = (screenW * LOGO_WIDTH_RATIO).toInt()
    val logoH = (logoW * LOGO_ASPECT).toInt()
    val logo = ImageView(this).apply {
      setImageResource(R.drawable.splash_logo_wordmark)
      adjustViewBounds = false
      scaleType = ImageView.ScaleType.FIT_CENTER
      layoutParams = FrameLayout.LayoutParams(logoW, logoH, Gravity.CENTER)
    }

    frame.addView(pattern)
    frame.addView(logo)
    addContentView(
      frame,
      FrameLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
      )
    )
    launchBridge = frame
  }

  override fun getMainComponentName(): String = "main"

  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
      this,
      BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
      object : DefaultReactActivityDelegate(
        this,
        mainComponentName,
        fabricEnabled
      ) {}
    )
  }

  override fun invokeDefaultOnBackPressed() {
    if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
      if (!moveTaskToBack(false)) {
        super.invokeDefaultOnBackPressed()
      }
      return
    }
    super.invokeDefaultOnBackPressed()
  }

  companion object {
    private val CORAL: Int = Color.parseColor("#F06B55")
    /** Keep in sync with components/SplashWordmark.tsx */
    private const val LOGO_WIDTH_RATIO = 0.72f
    private const val LOGO_ASPECT = 243f / 706f

    @JvmStatic
    @Volatile
    private var launchBridge: ViewGroup? = null

    @JvmStatic
    fun dismissLaunchBridge() {
      Handler(Looper.getMainLooper()).post {
        val bridge = launchBridge ?: return@post
        launchBridge = null
        (bridge.parent as? ViewGroup)?.removeView(bridge)
      }
    }
  }
}
