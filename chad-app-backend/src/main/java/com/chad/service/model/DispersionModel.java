package com.chad.service.model;

import com.chad.model.DispersionInput;
import com.chad.model.DispersionResult;

/**
 * Interface defining a dispersion model component.
 */
public interface DispersionModel {

    /**
     * Calculates the dispersion result for the given input parameters.
     *
     * @param input the dispersion input containing scenario and environmental data
     * @return a DispersionResult containing plume or hazard zone information
     */
    DispersionResult calculate(DispersionInput input);
}
