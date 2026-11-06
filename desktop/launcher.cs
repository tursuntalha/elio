using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text;
using System.Windows.Forms;

[assembly: AssemblyTitle("Elio")]
[assembly: AssemblyProduct("Elio")]
[assembly: AssemblyDescription("Elio terminal workspace")]
[assembly: AssemblyVersion("0.20.0.0")]
[assembly: AssemblyFileVersion("0.20.0.0")]
internal static class ElioLauncher {
    private static string Quote(string value) {
        var result = new StringBuilder("\"");
        int slashes = 0;
        foreach (char c in value) {
            if (c == '\\') { slashes++; continue; }
            if (c == '"') { result.Append('\\', slashes * 2 + 1); result.Append(c); }
            else { result.Append('\\', slashes); result.Append(c); }
            slashes = 0;
        }
        result.Append('\\', slashes * 2); result.Append('"');
        return result.ToString();
    }
    [STAThread]
    private static int Main(string[] args) {
        try {
            string directory = AppDomain.CurrentDomain.BaseDirectory;
            string root = Path.GetFullPath(Path.Combine(directory, ".."));
            string electron = Path.Combine(root, "node_modules", "electron", "dist", "electron.exe");
            string main = Path.Combine(directory, "main.cjs");
            if (!File.Exists(electron) || !File.Exists(main)) throw new IOException();
            var arguments = new StringBuilder(Quote(main));
            foreach (string arg in args) arguments.Append(" ").Append(Quote(arg));
            var start = new ProcessStartInfo(electron, arguments.ToString());
            start.WorkingDirectory = root;
            start.UseShellExecute = false;
            start.CreateNoWindow = true;
            start.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
            using (Process process = Process.Start(start)) { }
            return 0;
        } catch {
            MessageBox.Show("Elio başlatılamadı. Uygulama dosyalarının bulunduğu klasörü kontrol edin.", "Elio", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return 1;
        }
    }
}
