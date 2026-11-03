import type { ActuatorRun, ActuatorSample } from "@/lib/world-lab/electromechanical";

type Props = Readonly<{
  run: ActuatorRun;
  sample: ActuatorSample;
  timeSeconds: number;
}>;

function linePoints(run: ActuatorRun, width: number, height: number, inset: number) {
  const samples = run.samples;
  const values = samples.map(item => item.coilCurrentA);
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(0, ...values);
  const span = Math.max(maximum - minimum, 1e-9);
  const duration = run.input.durationSeconds;
  const stride = Math.max(1, Math.ceil((samples.length - 1) / 240));
  const selected = samples.filter((item, index) =>
    index % stride === 0 || index === samples.length - 1);
  const points = selected.map(item => {
    const x = inset + (item.timeSeconds / duration) * (width - 2 * inset);
    const y = height - inset - ((item.coilCurrentA - minimum) / span) * (height - 2 * inset);
    return x.toFixed(2) + "," + y.toFixed(2);
  }).join(" ");
  const markerX = inset + (Math.max(0, Math.min(duration, 0)) / duration) * (width - 2 * inset);
  return { points, minimum, maximum, markerX, inset, width, height, duration };
}

export function WorldLabMotorInternalsPanel({ run, sample, timeSeconds }: Props) {
  const plot = linePoints(run, 560, 170, 34);
  const x = 34 + (Math.max(0, Math.min(run.input.durationSeconds, timeSeconds)) /
    run.input.durationSeconds) * (560 - 68);
  const yRange = Math.max(1e-9, plot.maximum - plot.minimum);
  const y = 170 - 34 - ((sample.coilCurrentA - plot.minimum) / yRange) * (170 - 68);
  const thermal = run.input.thermal;
  const powerOffAt=run.input.powerOffAtSeconds??null;
  const cutoffX=powerOffAt===null?null:34+(powerOffAt/run.input.durationSeconds)*(560-68);
  const powerState=powerOffAt===null?"Supply switch remains closed":
    timeSeconds<powerOffAt?"Supply is connected; switch has not opened":
    sample.coilCurrentA>1e-4?"Supply isolated; inductive coil current is decaying":
    "Supply isolated; current has reached the near-zero state";
  return (
    <section className="mt-3 rounded-lg border border-border p-3"
      aria-label="Motor internal workings from computed actuator state">
      <h4 className="text-sm font-semibold">Inside the motor · computed state</h4>
      <p className="mt-1 text-xs text-muted-foreground">
        This run models a one-dimensional R–L coil actuator with back-EMF and a moving load.
        The diagram and readings below are derived from the recorded solver samples; they are not
        a measured motor or a spatial 3D magnetic-field simulation.
      </p>
      <ol className="mt-3 grid gap-2 text-center text-xs sm:grid-cols-4"
        aria-label="Modeled energy and motion path">
        <li className="rounded border border-border p-2">
          <span className="block font-medium">Voltage source</span>
          <span>{sample.sourceVoltageV.toFixed(3)} V applied</span>
          <span className="block text-muted-foreground">Commanded supply {run.input.supplyVoltageV.toFixed(3)} V</span>
        </li>
        <li className="rounded border border-border p-2">
          <span className="block font-medium">Coil R–L</span>
          <span>{sample.coilCurrentA.toFixed(4)} A</span>
          <span className="block text-muted-foreground">{(sample.coilResistanceOhm ?? run.input.resistanceOhm).toFixed(3)} Ω</span>
        </li>
        <li className="rounded border border-border p-2">
          <span className="block font-medium">Actuator force</span>
          <span>{sample.motorForceN.toFixed(3)} N</span>
          <span className="block text-muted-foreground">k = {run.input.forceConstantNPerA.toFixed(3)} N/A</span>
        </li>
        <li className="rounded border border-border p-2">
          <span className="block font-medium">Moving load</span>
          <span>{sample.heightM.toFixed(4)} m</span>
          <span className="block text-muted-foreground">{sample.velocityMps.toFixed(4)} m/s</span>
        </li>
      </ol>
      <p className="mt-2 rounded border border-border p-2 text-xs" role="status">
        {powerState}{powerOffAt===null?"": " · opening event at "+powerOffAt.toFixed(4)+" s"}.
        {powerOffAt===null?"":" The computed R–L current decays continuously after isolation; source voltage, force and resistive heating update from the recorded samples."}
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded border border-border p-2">
          <p className="text-xs font-medium">Recorded coil current</p>
          <svg viewBox="0 0 560 170" className="mt-1 h-32 w-full"
            role="img" aria-label={"Recorded coil current over " + run.input.durationSeconds.toFixed(3) +
              " seconds. Current range " + plot.minimum.toPrecision(4) + " to " +
              plot.maximum.toPrecision(4) + " amperes. Vertical marker shows selected simulation time."}>
            <line x1="34" y1="136" x2="526" y2="136" stroke="currentColor" opacity=".35"/>
            <line x1="34" y1="12" x2="34" y2="136" stroke="currentColor" opacity=".35"/>
            <polyline points={plot.points} fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
            {cutoffX!==null&&<line x1={cutoffX} y1="12" x2={cutoffX} y2="136"
              stroke="currentColor" strokeDasharray="2 3" opacity=".9">
              <title>{"Ideal source switch opens at "+powerOffAt!.toFixed(4)+" seconds"}</title>
            </line>}
            <line x1={x} y1="12" x2={x} y2="136" stroke="currentColor"
              strokeDasharray="4 3" opacity=".75"/>
            <circle cx={x} cy={y} r="4" fill="currentColor"/>
            <text x="34" y="157" fill="currentColor" fontSize="11">0 s</text>
            <text x="526" y="157" fill="currentColor" fontSize="11" textAnchor="end">
              {run.input.durationSeconds.toFixed(2)} s
            </text>
            <text x="30" y="10" fill="currentColor" fontSize="10" textAnchor="end">
              {plot.maximum.toPrecision(3)} A
            </text>
            <text x="30" y="146" fill="currentColor" fontSize="10" textAnchor="end">
              {plot.minimum.toPrecision(3)} A
            </text>
          </svg>
          <p className="text-right text-[11px] text-muted-foreground">
            Selected time: {timeSeconds.toFixed(5)} s
          </p>
          {powerOffAt!==null&&<p className="text-[11px] text-muted-foreground">
            Dashed marker: source switch opens at {powerOffAt.toFixed(4)} s
          </p>}
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          <div><dt className="text-muted-foreground">Back-EMF</dt><dd>{sample.backEmfV.toFixed(4)} V</dd></div>
          <div><dt className="text-muted-foreground">Electrical input power</dt><dd>{sample.sourcePowerW.toFixed(4)} W</dd></div>
          <div><dt className="text-muted-foreground">Resistive heating</dt><dd>{sample.resistiveHeatW.toFixed(4)} W</dd></div>
          <div><dt className="text-muted-foreground">Kinetic energy</dt><dd>{sample.kineticEnergyJ.toFixed(5)} J</dd></div>
          <div><dt className="text-muted-foreground">Magnetic energy in the lumped inductor</dt><dd>{sample.magneticEnergyJ.toFixed(5)} J</dd></div>
          <div><dt className="text-muted-foreground">Energy-balance residual</dt><dd>{sample.energyResidualJ.toExponential(3)} J</dd></div>
          {thermal && sample.coilTemperatureK !== undefined && sample.coilTemperatureK !== null && <>
            <div><dt className="text-muted-foreground">Coil temperature</dt><dd>{sample.coilTemperatureK.toFixed(3)} K</dd></div>
            <div><dt className="text-muted-foreground">Temperature-adjusted resistance</dt><dd>{(sample.coilResistanceOhm ?? run.input.resistanceOhm).toFixed(4)} Ω</dd></div>
            <div><dt className="text-muted-foreground">Thermal energy above initial state</dt><dd>{(sample.thermalEnergyJ ?? 0).toFixed(4)} J</dd></div>
            <div><dt className="text-muted-foreground">Cooling power</dt><dd>{(sample.coolingPowerW ?? 0).toFixed(4)} W</dd></div>
          </>}
        </dl>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {thermal
          ? "Thermal coupling uses one assumed lumped heat capacity and cooling coefficient. It does not resolve a coil temperature field, insulation failure or a battery."
          : "Thermal gradients and temperature-dependent coil resistance are not enabled in this run. No battery state-of-charge or internal resistance is calculated."}
        {" "}The force constant is a simplified electromechanical coupling; this is a linear actuator, not a rotary torque or spatial magnetic-field solution. No unmeasured field lines or particle animations are shown.
      </p>
    </section>
  );
}
