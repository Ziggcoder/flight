export function setText(element, value) {
  const text = String(value);
  if (element.textContent !== text) element.textContent = text;
}

export function createHUD(ui, players, getState) {
  return function updateHUD() {
    const { gameTime, matchPaused } = getState();
    players.forEach((player, index) => {
      setText(ui.score[index], player.score);
      setText(ui.health[index], player.health);
      const healthScale = `scaleX(${player.health / 100})`;
      if (ui.healthFill[index].style.transform !== healthScale) ui.healthFill[index].style.transform = healthScale;
      setText(ui.altitude[index], String(Math.round(player.flight.airplane.position.y)).padStart(3, "0"));
      setText(ui.speed[index], String(Math.round(player.flight.flightSpeed)).padStart(3, "0"));
      setText(ui.pitch[index], player.controls.pitch.toFixed(1));
      setText(ui.roll[index], player.controls.roll.toFixed(1));
      ui.warning[index].classList.toggle("is-hidden", !player.flight.isLowAltitude() || !player.flight.alive);

      const respawning = !player.flight.alive && !matchPaused;
      ui.respawn[index].classList.toggle("is-hidden", !respawning);
      if (respawning) setText(ui.respawn[index].querySelector("strong span"), String(Math.max(0, Math.ceil(player.respawnAt - gameTime))).padStart(2, "0"));

      if (ui.networkDebug.classList.contains("is-hidden")) return;
      const network = player.remote?.getDiagnostics();
      const ping = network?.pingMs == null ? "--" : `${Math.round(network.pingMs)}ms`;
      const pps = network ? Math.round(network.packetsPerSecond) : 0;
      const age = network?.packetAgeMs == null ? "--" : `${Math.round(network.packetAgeMs)}ms`;
      const sequence = network?.sequence == null ? "--" : network.sequence;
      const fire = network?.fireHeld ? "ON" : "OFF";
      const status = (network?.status || "offline").toUpperCase();
      setText(ui.debug[index], `${status} · PING ${ping} · ${pps} PPS · AGE ${age} · SEQ ${sequence} · FIRE ${fire}`);
    });
  }

}
