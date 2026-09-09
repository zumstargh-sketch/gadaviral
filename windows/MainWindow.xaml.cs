using System;
using System.IO;
using System.Windows;
using Microsoft.Web.WebView2.Wpf;

namespace GADAVIRAL;

public partial class MainWindow : Window
{
    // Same backend + same web app as the website. Loads the deployed SPA path
    // directly (the site root also redirects to it). Dev override:
    // GADAVIRAL_WEB_APP_URL=http://localhost:5173/app/
    private static readonly string WebAppUrl =
        Environment.GetEnvironmentVariable("GADAVIRAL_WEB_APP_URL")
        ?? "https://www.gadaviral.com/app/";

    public MainWindow()
    {
        InitializeComponent();
        InitializeWebView();
    }

    private async void InitializeWebView()
    {
        try
        {
            StatusText.Text = "Preparing the GADAVIRAL runtime…";
            var webView = new WebView2
            {
                DefaultBackgroundColor = System.Drawing.Color.FromArgb(11, 11, 13),
            };
            WebViewHost.Children.Add(webView);

            // Keep the user data folder next to the exe (portable, no admin needed)
            var dataDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "GADAVIRAL", "WebView2");
            Directory.CreateDirectory(dataDir);
            await webView.EnsureCoreWebView2Async();
            webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
            webView.CoreWebView2.Settings.IsZoomControlEnabled = true;
            webView.CoreWebView2.Settings.IsStatusBarEnabled = false;

            webView.CoreWebView2.DocumentTitleChanged += (_, _) =>
                Title = string.IsNullOrEmpty(webView.CoreWebView2.DocumentTitle)
                    ? "GADAVIRAL — Dangme & Ga Online Social Community"
                    : $"{webView.CoreWebView2.DocumentTitle} — GADAVIRAL";

            webView.NavigationCompleted += (_, _) =>
            {
                SplashLayer.Visibility = Visibility.Collapsed;
                WebViewHost.Visibility = Visibility.Visible;
            };

            StatusText.Text = $"Connecting to {WebAppUrl} …";
            webView.Source = new Uri(WebAppUrl);
        }
        catch (Exception ex)
        {
            StatusText.Text = "Could not start the GADAVIRAL runtime. " +
                "Install the Microsoft Edge WebView2 Runtime, then try again.\n\n" + ex.Message;
        }
    }
}
